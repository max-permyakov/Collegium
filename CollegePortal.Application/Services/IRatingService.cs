using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IRatingService
{
    /// <summary>Returns null when the user has no student profile.</summary>
    Task<GroupRatingDto?> GetGroupRatingAsync(Guid userId, string? subject, CancellationToken ct = default);

    /// <summary>Returns null when the user has no student profile.</summary>
    Task<RatingParticipationDto?> SetParticipationAsync(Guid userId, bool enabled, CancellationToken ct = default);
}
