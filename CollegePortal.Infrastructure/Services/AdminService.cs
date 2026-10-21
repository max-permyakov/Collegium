using CollegePortal.Application;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.ExternalApis.Diary;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class AdminService : IAdminService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly CollegePortalDbContext _dbContext;
    private readonly IDiaryApiClient _diaryApiClient;
    private readonly IProfileService _profileService;
    private readonly ILogger<AdminService> _logger;

    public AdminService(
        UserManager<ApplicationUser> userManager,
        CollegePortalDbContext dbContext,
        IDiaryApiClient diaryApiClient,
        IProfileService profileService,
        ILogger<AdminService> logger)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _diaryApiClient = diaryApiClient;
        _profileService = profileService;
        _logger = logger;
    }

    public async Task<AdminUsersPageDto> GetUsersAsync(
        int page,
        int pageSize,
        string? query,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var usersQuery = ApplyUserSearch(_dbContext.Users.AsNoTracking(), query);
        var total = await usersQuery.CountAsync(ct);

        var items = await LoadUsersAsync(
            usersQuery,
            skip: (page - 1) * pageSize,
            take: pageSize,
            ct);

        return new AdminUsersPageDto(items.ToArray(), total, page, pageSize);
    }

    public async Task<IReadOnlyList<AdminUserDto>> GetUsersForExportAsync(CancellationToken ct = default)
    {
        return await LoadUsersAsync(_dbContext.Users.AsNoTracking(), skip: null, take: null, ct);
    }

    private static IQueryable<ApplicationUser> ApplyUserSearch(
        IQueryable<ApplicationUser> usersQuery,
        string? query)
    {
        var term = query?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(term))
            return usersQuery;

        return usersQuery.Where(u =>
            u.DisplayName.ToLower().Contains(term) ||
            (u.UserName != null && u.UserName.ToLower().Contains(term)) ||
            (u.Email != null && u.Email.ToLower().Contains(term)) ||
            (u.PhoneNumber != null && u.PhoneNumber.ToLower().Contains(term)) ||
            (u.StudentProfile != null && u.StudentProfile.StudyGroup.Name.ToLower().Contains(term)));
    }

    private static async Task<List<AdminUserDto>> LoadUsersAsync(
        IQueryable<ApplicationUser> usersQuery,
        int? skip,
        int? take,
        CancellationToken ct)
    {
        var projected = usersQuery
            .OrderBy(u => u.DisplayName)
            .ThenBy(u => u.Id)
            .Select(u => new
            {
                u.Id,
                u.UserName,
                u.DisplayName,
                u.Email,
                u.PhoneNumber,
                u.Role,
                u.IsActive,
                u.IsProtected,
                u.LastLoginAt,
                u.LastActivityAt,
                u.CreatedAt,
                StudyGroupId = u.StudentProfile != null ? (Guid?)u.StudentProfile.StudyGroupId : null,
                StudyGroupName = u.StudentProfile != null ? u.StudentProfile.StudyGroup.Name : null,
                Course = u.StudentProfile != null ? (int?)u.StudentProfile.StudyGroup.Course : null,
                HeadmanRoleVal = u.StudentProfile != null ? u.StudentProfile.HeadmanRole : HeadmanRole.None,
                AverageMarkVal = u.StudentProfile != null ? u.StudentProfile.AverageMark : null,
                GradesCachedAtVal = u.StudentProfile != null ? u.StudentProfile.GradesCachedAt : null
            });

        if (skip is int skipCount)
            projected = projected.Skip(skipCount);
        if (take is int takeCount)
            projected = projected.Take(takeCount);

        var users = await projected.ToListAsync(ct);

        return users.Select(u => new AdminUserDto(
            u.Id,
            u.UserName ?? "",
            u.DisplayName,
            u.Email,
            u.PhoneNumber,
            u.StudyGroupId,
            u.StudyGroupName,
            u.Course,
            u.Role,
            u.IsActive,
            u.IsProtected,
            u.HeadmanRoleVal.ToString(),
            u.AverageMarkVal,
            u.GradesCachedAtVal,
            u.LastLoginAt,
            u.LastActivityAt,
            u.CreatedAt
        )).ToList();
    }

    public async Task<StatisticsDto> GetStatisticsAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;

        var totalUsers = await _dbContext.Users.CountAsync(ct);
        // "Online" = any authenticated request within the tracker's online
        // window; "active" = any request within the last 7 days.
        var onlineUsers = await _dbContext.Users
            .CountAsync(u => u.LastActivityAt >= now - ActivityTracking.OnlineWindow, ct);
        var activeUsers = await _dbContext.Users
            .CountAsync(u => u.LastActivityAt >= now - ActivityTracking.ActiveWindow, ct);
        var adminUsers = await _dbContext.Users.CountAsync(u => u.Role == "Admin", ct);
        var protectedAdmins = await _dbContext.Users.CountAsync(u => u.IsProtected, ct);
        var totalGroups = await _dbContext.StudyGroups.CountAsync(ct);
        var totalAnnouncements = await _dbContext.Announcements.CountAsync(ct);
        var totalAssignments = await _dbContext.Assignments.CountAsync(ct);

        var groups = await _dbContext.StudyGroups
            .AsNoTracking()
            .Select(g => new { g.Id, g.Name, g.Course, StudentCount = g.Students.Count })
            .OrderBy(x => x.Name)
            .ToListAsync(ct);

        var loginsLast7 = await _dbContext.Users.CountAsync(u => u.LastLoginAt >= now.AddDays(-7), ct);
        var loginsLast30 = await _dbContext.Users.CountAsync(u => u.LastLoginAt >= now.AddDays(-30), ct);

        var topStudents = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Where(sp => sp.AverageMark.HasValue)
            .Select(sp => new
            {
                UserId = sp.UserId,
                DisplayName = sp.User.DisplayName,
                GroupName = sp.StudyGroup.Name,
                sp.AverageMark
            })
            .OrderByDescending(x => x.AverageMark)
            .Take(5)
            .ToListAsync(ct);

        return new StatisticsDto(
            totalUsers,
            onlineUsers,
            activeUsers,
            adminUsers,
            protectedAdmins,
            totalGroups,
            totalAnnouncements,
            totalAssignments,
            groups.Select(g => new StatisticsGroupDto(g.Id, g.Name, g.Course, g.StudentCount)).ToArray(),
            new StatisticsLoginsDto(loginsLast7, loginsLast30),
            topStudents.Select(s => new StatisticsTopStudentDto(
                s.UserId,
                s.DisplayName,
                s.GroupName,
                s.AverageMark!.Value
            )).ToArray()
        );
    }

    public async Task<ProfileDto?> GetUserDetailAsync(Guid adminUserId, Guid targetUserId, CancellationToken ct = default)
    {
        return await _profileService.GetProfileForViewAsync(adminUserId, targetUserId, ct);
    }

    public async Task<AdminActionResult> SetRoleAsync(Guid adminUserId, Guid targetUserId, string role, CancellationToken ct = default)
    {
        var admin = await _userManager.FindByIdAsync(adminUserId.ToString());
        if (admin == null || !admin.IsProtected)
            return new AdminActionResult(false, "Назначать и снимать администраторов может только первичный администратор");

        if (role != "Admin" && role != "Student")
            return new AdminActionResult(false, "Недопустимая роль");

        var target = await _userManager.FindByIdAsync(targetUserId.ToString());
        if (target == null)
            return new AdminActionResult(false, "Пользователь не найден");

        if (target.IsProtected)
            return new AdminActionResult(false, "Нельзя изменить роль защищённого администратора");

        if (target.Role == role)
            return new AdminActionResult(true);

        target.Role = role;
        // Revoke any credential already issued to the affected account: the
        // stamp invalidates access tokens, the refresh tokens are revoked below.
        target.SecurityStamp = Guid.NewGuid().ToString();
        var updateResult = await _userManager.UpdateAsync(target);
        if (!updateResult.Succeeded)
            return new AdminActionResult(false, string.Join("; ", updateResult.Errors.Select(e => e.Description)));

        await RevokeAllRefreshTokensAsync(targetUserId, ct);

        if (role == "Admin" && !await _userManager.IsInRoleAsync(target, "Admin"))
            await _userManager.AddToRoleAsync(target, "Admin");
        else if (role == "Student" && await _userManager.IsInRoleAsync(target, "Admin"))
            await _userManager.RemoveFromRoleAsync(target, "Admin");

        await WriteAuditAsync(adminUserId, targetUserId, "SetRole", $"Роль изменена на {role}", ct);
        return new AdminActionResult(true);
    }

    public async Task<AdminActionResult> SetIsActiveAsync(Guid adminUserId, Guid targetUserId, bool isActive, CancellationToken ct = default)
    {
        var target = await _userManager.FindByIdAsync(targetUserId.ToString());
        if (target == null)
            return new AdminActionResult(false, "Пользователь не найден");

        if (target.IsProtected)
            return new AdminActionResult(false, "Нельзя заблокировать защищённого администратора");

        if (adminUserId == targetUserId && !isActive)
            return new AdminActionResult(false, "Нельзя заблокировать самого себя");

        if (target.IsActive == isActive)
            return new AdminActionResult(true);

        target.IsActive = isActive;
        // Revoke any credential already issued to the affected account: the
        // stamp invalidates access tokens, the refresh tokens are revoked below.
        target.SecurityStamp = Guid.NewGuid().ToString();
        var updateResult = await _userManager.UpdateAsync(target);
        if (!updateResult.Succeeded)
            return new AdminActionResult(false, string.Join("; ", updateResult.Errors.Select(e => e.Description)));

        await RevokeAllRefreshTokensAsync(targetUserId, ct);

        await WriteAuditAsync(adminUserId, targetUserId, "SetIsActive", isActive ? "Разблокирован" : "Заблокирован", ct);
        return new AdminActionResult(true);
    }

    // The security stamp only invalidates already-issued access tokens; the
    // long-lived refresh cookies must be revoked explicitly as well.
    private async Task RevokeAllRefreshTokensAsync(Guid userId, CancellationToken ct)
    {
        var tokens = await _dbContext.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync(ct);
        if (tokens.Count == 0)
            return;

        var now = DateTime.UtcNow;
        foreach (var token in tokens)
            token.RevokedAt = now;
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task<AdminActionResult> SetHeadmanAsync(Guid adminUserId, Guid targetUserId, string headmanRole, CancellationToken ct = default)
    {
        if (!Enum.TryParse<HeadmanRole>(headmanRole, true, out var roleValue))
            return new AdminActionResult(false, "Недопустимая роль старосты");

        var profile = await _dbContext.StudentProfiles
            .Include(sp => sp.User)
            .FirstOrDefaultAsync(sp => sp.UserId == targetUserId, ct);
        if (profile == null)
            return new AdminActionResult(false, "Студенческий профиль не найден");

        var target = profile.User;
        var admin = await _userManager.FindByIdAsync(adminUserId.ToString());
        if (admin == null)
            return new AdminActionResult(false, "Администратор не найден");

        if (roleValue != HeadmanRole.None)
        {
            // Один староста и один заместитель на группу: снимаем то же значение у других в группе.
            var sameRoleHolders = await _dbContext.StudentProfiles
                .Where(sp => sp.StudyGroupId == profile.StudyGroupId
                             && sp.Id != profile.Id
                             && sp.HeadmanRole == roleValue)
                .ToListAsync(ct);
            foreach (var holder in sameRoleHolders)
                holder.HeadmanRole = HeadmanRole.None;
        }

        profile.HeadmanRole = roleValue;
        profile.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        await WriteAuditAsync(adminUserId, targetUserId, "SetHeadman", $"Роль старосты: {roleValue}", ct);
        return new AdminActionResult(true);
    }

    public async Task<AdminActionResult> RecomputeGradesAsync(Guid targetUserId, CancellationToken ct = default)
    {
        var profile = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(sp => sp.UserId == targetUserId, ct);
        if (profile == null)
            return new AdminActionResult(false, "Студенческий профиль не найден");

        try
        {
            var subjects = await _diaryApiClient.GetDashboardForUserAsync(targetUserId, profile.ExternalStudentId, ct);
            if (subjects == null || subjects.Length == 0)
            {
                profile.AverageMark = null;
                profile.GradesCachedAt = DateTime.UtcNow;
                await _dbContext.SaveChangesAsync(ct);
                return new AdminActionResult(true, "Оценок пока нет");
            }

            var average = Math.Round(subjects.Average(s => s.Mark), 2);
            profile.AverageMark = (decimal)average;
            profile.GradesCachedAt = DateTime.UtcNow;
            profile.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(ct);

            await WriteAuditAsync(targetUserId, targetUserId, "RecomputeGrades", $"Средний балл пересчитан: {average:F2}", ct);
            return new AdminActionResult(true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to recompute grades for user {UserId}", targetUserId);
            return new AdminActionResult(false, "Не удалось пересчитать оценки (возможно, сессия дневника истекла)");
        }
    }

    public async Task<IReadOnlyList<AuditLogDto>> GetAuditAsync(int limit, CancellationToken ct = default)
    {
        var logs = await _dbContext.AdminAuditLogs
            .AsNoTracking()
            .Include(l => l.AdminUser)
            .OrderByDescending(l => l.CreatedAt)
            .Take(Math.Clamp(limit, 1, 500))
            .ToListAsync(ct);

        var targetNames = new Dictionary<Guid, string>();
        foreach (var targetId in logs.Where(l => l.TargetUserId.HasValue).Select(l => l.TargetUserId!.Value).Distinct())
        {
            var target = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == targetId, ct);
            if (target != null)
                targetNames[targetId] = target.DisplayName;
        }

        return logs.Select(l => new AuditLogDto(
            l.Id,
            l.AdminUserId,
            l.AdminUser.DisplayName,
            l.Action,
            l.TargetUserId,
            l.TargetUserId.HasValue && targetNames.TryGetValue(l.TargetUserId.Value, out var name) ? name : null,
            l.Details,
            l.CreatedAt
        )).ToList();
    }

    private async Task WriteAuditAsync(Guid adminUserId, Guid targetUserId, string action, string details, CancellationToken ct)
    {
        try
        {
            _dbContext.AdminAuditLogs.Add(new AdminAuditLog
            {
                Id = Guid.NewGuid(),
                AdminUserId = adminUserId,
                TargetUserId = targetUserId,
                Action = action,
                Details = details,
                CreatedAt = DateTime.UtcNow
            });
            await _dbContext.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log for action {Action}", action);
        }
    }
}