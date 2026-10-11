using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IGradesService
{
    Task<GradesResponseDto?> GetGradesAsync(Guid userId, CancellationToken ct = default);
    Task<PerformanceDto?> GetPerformanceAsync(Guid userId, CancellationToken ct = default);
}