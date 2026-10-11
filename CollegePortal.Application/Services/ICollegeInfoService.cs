using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface ICollegeInfoService
{
    Task<CollegeCatalogDto?> GetCatalogAsync(CancellationToken ct = default);

    Task<CollegeInfoActionResult> RefreshCatalogAsync(CancellationToken ct = default);

    Task<CollegeScheduleSearchDto?> SearchScheduleAsync(string type, string query, DateTime? date, CancellationToken ct = default);

    Task<CollegeTeacherDto[]> GetTeachersAsync(CancellationToken ct = default);

    Task<CollegeInfoActionResult> RefreshTeachersAsync(Guid? adminUserId, CancellationToken ct = default);
}