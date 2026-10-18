using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class ProfileService : IProfileService
{
    private const int MaxAvatarDataUrlLength = 3_000_000;
    private const int MaxBioLength = 200;

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly CollegePortalDbContext _dbContext;
    private readonly ILogger<ProfileService> _logger;

    public ProfileService(
        UserManager<ApplicationUser> userManager,
        CollegePortalDbContext dbContext,
        ILogger<ProfileService> logger)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<ProfileDto?> GetProfileAsync(Guid userId, CancellationToken ct = default)
    {
        return await GetProfileInternalAsync(userId, userId, ct);
    }

    public async Task<ProfileDto?> GetProfileForViewAsync(Guid requesterUserId, Guid targetUserId, CancellationToken ct = default)
    {
        var requester = await _userManager.FindByIdAsync(requesterUserId.ToString());
        if (requester == null)
            return null;

        var roles = await _userManager.GetRolesAsync(requester);
        if (!roles.Contains("Admin"))
            return null;

        return await GetProfileInternalAsync(requesterUserId, targetUserId, ct);
    }

    private async Task<ProfileDto?> GetProfileInternalAsync(Guid requesterUserId, Guid targetUserId, CancellationToken ct)
    {
        var user = await _userManager.FindByIdAsync(targetUserId.ToString());
        if (user == null)
            return null;

        var roles = await _userManager.GetRolesAsync(user);
        var requester = await _userManager.FindByIdAsync(requesterUserId.ToString());
        var requesterRoles = requester == null ? Array.Empty<string>() : await _userManager.GetRolesAsync(requester);

        var profile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == targetUserId, ct);

        return new ProfileDto(
            user.Id,
            user.UserName ?? "",
            user.DisplayName,
            user.Email,
            user.PhoneNumber,
            profile?.StudyGroupId,
            profile?.StudyGroup?.Name,
            profile?.StudyGroup?.Course,
            roles.FirstOrDefault() ?? "Student",
            user.IsActive,
            user.IsProtected,
            profile?.HeadmanRole.ToString() ?? "None",
            profile?.Bio,
            profile?.AvatarDataUrl,
            profile?.AverageMark,
            profile?.GradesCachedAt,
            user.LastLoginAt,
            user.CreatedAt,
            requesterRoles.Contains("Admin")
        );
    }

    public async Task<PublicProfileDto?> GetPublicProfileAsync(Guid viewerUserId, Guid targetUserId, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(targetUserId.ToString());
        if (user == null)
            return null;

        var profile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == targetUserId, ct);

        var viewer = await _userManager.FindByIdAsync(viewerUserId.ToString());
        var viewerIsAdmin = viewer != null && (await _userManager.GetRolesAsync(viewer)).Contains("Admin");

        // Only expose clubs the viewer is allowed to see: public clubs, clubs the
        // viewer shares, or anything when the viewer is an administrator.
        var clubs = await _dbContext.ClubMembers
            .AsNoTracking()
            .Where(m => m.UserId == targetUserId)
            .Select(m => m.Club)
            .Where(c => viewerIsAdmin
                || !c.IsPrivate
                || c.Members.Any(x => x.UserId == viewerUserId))
            .OrderBy(c => c.Name)
            .Select(c => new PublicClubDto(c.Id, c.Name, c.AvatarDataUrl, c.IsPrivate))
            .ToArrayAsync(ct);

        return new PublicProfileDto(
            user.Id,
            user.DisplayName,
            profile?.StudyGroup?.Name,
            profile?.HeadmanRole.ToString() ?? "None",
            profile?.Bio,
            profile?.AvatarDataUrl,
            clubs
        );
    }

    public async Task<ProfileUpdateResult> UpdateProfileAsync(Guid userId, UpdateProfileRequestDto request, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null)
            return new ProfileUpdateResult(false, "Пользователь не найден");

        var bio = TextSanitizer.Clean(request.Bio);
        if (bio.Length > MaxBioLength)
            return new ProfileUpdateResult(false, $"Био слишком длинное (максимум {MaxBioLength} символов)");

        if (!string.IsNullOrWhiteSpace(request.Email) && request.Email.Length > 200)
            return new ProfileUpdateResult(false, "Email слишком длинный");

        if (!string.IsNullOrWhiteSpace(request.PhoneNumber) && request.PhoneNumber.Length > 50)
            return new ProfileUpdateResult(false, "Телефон слишком длинный");

        if (!string.IsNullOrWhiteSpace(request.Email) && !request.Email.Equals(user.Email, StringComparison.OrdinalIgnoreCase))
        {
            var existing = await _userManager.FindByEmailAsync(request.Email);
            if (existing != null && existing.Id != user.Id)
                return new ProfileUpdateResult(false, "Такой email уже занят");
        }

        user.Email = string.IsNullOrWhiteSpace(request.Email) ? user.Email : request.Email.Trim();
        user.PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? user.PhoneNumber : request.PhoneNumber.Trim();
        user.EmailConfirmed = true;
        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            var errors = string.Join("; ", updateResult.Errors.Select(e => e.Description));
            _logger.LogWarning("Profile update failed for user {UserId}: {Errors}", userId, errors);
            return new ProfileUpdateResult(false, errors);
        }

        var profile = await _dbContext.StudentProfiles.FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
        if (profile != null)
        {
            profile.Bio = string.IsNullOrEmpty(bio) ? null : bio;
            profile.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(ct);
        }

        return new ProfileUpdateResult(true);
    }

    public async Task<bool> SetAvatarAsync(Guid userId, string? dataUrl, CancellationToken ct = default)
    {
        var profile = await _dbContext.StudentProfiles.FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
        if (profile == null)
            return false;

        if (!string.IsNullOrEmpty(dataUrl))
        {
            if (!dataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
                return false;
            if (dataUrl.Length > MaxAvatarDataUrlLength)
                return false;
            var commaIndex = dataUrl.IndexOf(',');
            if (commaIndex < 0)
                return false;
        }

        profile.AvatarDataUrl = string.IsNullOrEmpty(dataUrl) ? null : dataUrl;
        profile.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
        return true;
    }
}