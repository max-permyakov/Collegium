using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IProfileService
{
    Task<ProfileDto?> GetProfileAsync(Guid userId, CancellationToken ct = default);
    Task<ProfileDto?> GetProfileForViewAsync(Guid requesterUserId, Guid targetUserId, CancellationToken ct = default);
    Task<ProfileUpdateResult> UpdateProfileAsync(Guid userId, UpdateProfileRequestDto request, CancellationToken ct = default);
    Task<bool> SetAvatarAsync(Guid userId, string? dataUrl, CancellationToken ct = default);
}