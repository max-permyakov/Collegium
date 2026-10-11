using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface ICollegeMapService
{
    Task<CollegeMapDto> GetMapAsync(CancellationToken ct = default);

    Task<BuildingDto[]> GetBuildingsAsync(CancellationToken ct = default);

    Task<DisciplineDto[]> GetDisciplinesAsync(CancellationToken ct = default);

    Task<MapSearchResultDto> SearchAsync(string query, CancellationToken ct = default);

    Task<BuildingDto> CreateBuildingAsync(Guid adminUserId, CreateBuildingDto dto, CancellationToken ct = default);

    Task<MapActionResult> UpdateBuildingAsync(Guid id, Guid adminUserId, UpdateBuildingDto dto, CancellationToken ct = default);

    Task<MapActionResult> DeleteBuildingAsync(Guid id, Guid adminUserId, CancellationToken ct = default);

    Task<AuditoriumDto> CreateAuditoriumAsync(Guid adminUserId, CreateAuditoriumDto dto, CancellationToken ct = default);

    Task<MapActionResult> UpdateAuditoriumAsync(Guid id, Guid adminUserId, UpdateAuditoriumDto dto, CancellationToken ct = default);

    Task<MapActionResult> DeleteAuditoriumAsync(Guid id, Guid adminUserId, CancellationToken ct = default);
}
