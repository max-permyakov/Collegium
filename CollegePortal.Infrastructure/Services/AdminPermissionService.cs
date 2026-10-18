using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class AdminPermissionService : IAdminPermissionService
{
    private static readonly Permission[] AllPermissions = Enum.GetValues<Permission>();

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly CollegePortalDbContext _dbContext;
    private readonly ILogger<AdminPermissionService> _logger;

    public AdminPermissionService(
        UserManager<ApplicationUser> userManager,
        CollegePortalDbContext dbContext,
        ILogger<AdminPermissionService> logger)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<AdminPermissionsDto?> GetPermissionsAsync(Guid targetUserId, CancellationToken ct = default)
    {
        var target = await _userManager.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == targetUserId, ct);
        if (target == null)
            return null;

        var isAdmin = await _userManager.IsInRoleAsync(target, "Admin");
        var permissions = isAdmin
            ? AllPermissions
            : await _dbContext.UserPermissions.AsNoTracking()
                .Where(up => up.UserId == targetUserId)
                .Select(up => up.Permission)
                .OrderBy(p => p)
                .ToArrayAsync(ct);

        return new AdminPermissionsDto(target.Id, target.DisplayName, target.Email ?? "", isAdmin, permissions);
    }

    public async Task<bool> SetPermissionsAsync(Guid actorUserId, Guid targetUserId, SetAdminPermissionsDto dto, CancellationToken ct = default)
    {
        var actor = await _userManager.FindByIdAsync(actorUserId.ToString());
        if (actor == null || !actor.IsProtected)
        {
            // Only the protected (primary) admin can hand out granular rights —
            // mirrors AdminService.SetRoleAsync.
            await WriteAuditAsync(actorUserId, actorUserId, "SetPermissionsDenied",
                $"В выдаче прав отказано (цель: {targetUserId})", ct);
            return false;
        }

        var target = await _userManager.FindByIdAsync(targetUserId.ToString());
        if (target == null)
            return false;

        if (target.IsProtected)
            return false;

        if (await _userManager.IsInRoleAsync(target, "Admin"))
            return false; // full admins already have every right

        var requested = (dto.Permissions ?? Array.Empty<Permission>())
            .Distinct()
            .ToArray();

        if (requested.Any(p => !AllPermissions.Contains(p)))
            return false;

        var existing = await _dbContext.UserPermissions
            .Where(up => up.UserId == targetUserId)
            .ToListAsync(ct);

        var existingSet = existing.Select(up => up.Permission).ToHashSet();
        var requestedSet = requested.ToHashSet();

        var toRemove = existing.Where(up => !requestedSet.Contains(up.Permission)).ToList();
        var toAdd = requested.Where(p => !existingSet.Contains(p))
            .Select(p => new UserPermission { Id = Guid.NewGuid(), UserId = targetUserId, Permission = p })
            .ToList();

        if (toRemove.Count == 0 && toAdd.Count == 0)
            return true;

        _dbContext.UserPermissions.RemoveRange(toRemove);
        _dbContext.UserPermissions.AddRange(toAdd);
        await _dbContext.SaveChangesAsync(ct);

        var changed = string.Join(", ", requested.Select(PermissionName));
        await WriteAuditAsync(actorUserId, targetUserId, "SetPermissions",
            requested.Length == 0 ? "Права отозваны" : $"Права: {changed}", ct);

        return true;
    }

    public async Task<Permission[]> GetEffectivePermissionsAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _userManager.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user == null)
            return Array.Empty<Permission>();

        if (await _userManager.IsInRoleAsync(user, "Admin"))
            return AllPermissions;

        return await _dbContext.UserPermissions.AsNoTracking()
            .Where(up => up.UserId == userId)
            .Select(up => up.Permission)
            .OrderBy(p => p)
            .ToArrayAsync(ct);
    }

    private static string PermissionName(Permission permission) => permission switch
    {
        Permission.UsersManage => "пользователи",
        Permission.NewsManage => "новости",
        Permission.AssignmentsManage => "задания",
        Permission.ClubsManage => "кружки",
        Permission.CollegeInfoManage => "информация о колледже",
        Permission.MapManage => "карта",
        Permission.AuditView => "аудит",
        _ => permission.ToString()
    };

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
