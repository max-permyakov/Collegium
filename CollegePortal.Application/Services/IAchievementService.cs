using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

/// <summary>
/// Lazy achievement engine: evaluates each achievement against persisted data
/// and records the first moment its condition became true.
/// </summary>
public interface IAchievementService
{
    Task<IReadOnlyList<AchievementDto>> GetForUserAsync(Guid userId, CancellationToken ct = default);
}
