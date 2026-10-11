using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IAnnouncementService
{
    Task<AnnouncementListDto[]> GetPublishedAsync(Guid? studyGroupId = null, CancellationToken ct = default);
    Task<AnnouncementDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<AnnouncementDto> CreateAsync(Guid authorId, CreateAnnouncementDto dto, CancellationToken ct = default);
    Task<AnnouncementDto?> UpdateAsync(Guid id, Guid authorId, UpdateAnnouncementDto dto, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, Guid authorId, CancellationToken ct = default);
    Task<bool> TogglePublishedAsync(Guid id, Guid authorId, CancellationToken ct = default);
}