using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IGradesService
{
    Task<GradesResponseDto?> GetGradesAsync(Guid userId, CancellationToken ct = default);
    Task<PerformanceDto?> GetPerformanceAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Re-fetches the diary dashboard and stores the resulting average mark in
    /// the database (StudentProfile.AverageMark). Called when the student
    /// presses the refresh button, so group ratings read the persisted value
    /// instead of ad-hoc recalculations.
    /// </summary>
    Task<GradesRefreshResult?> RefreshGradesAsync(Guid userId, CancellationToken ct = default);
}

public record GradesRefreshResult(
    bool Success,
    string? Error = null,
    decimal? AverageMark = null);