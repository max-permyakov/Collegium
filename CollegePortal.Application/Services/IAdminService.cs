using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IAdminService
{
    Task<AdminUsersPageDto> GetUsersAsync(int page, int pageSize, string? query, CancellationToken ct = default);
    Task<IReadOnlyList<AdminUserDto>> GetUsersForExportAsync(CancellationToken ct = default);
    Task<StatisticsDto> GetStatisticsAsync(CancellationToken ct = default);
    Task<ProfileDto?> GetUserDetailAsync(Guid adminUserId, Guid targetUserId, CancellationToken ct = default);
    Task<AdminActionResult> SetRoleAsync(Guid adminUserId, Guid targetUserId, string role, CancellationToken ct = default);
    Task<AdminActionResult> SetIsActiveAsync(Guid adminUserId, Guid targetUserId, bool isActive, CancellationToken ct = default);
    Task<AdminActionResult> SetHeadmanAsync(Guid adminUserId, Guid targetUserId, string headmanRole, CancellationToken ct = default);
    Task<AdminActionResult> RecomputeGradesAsync(Guid targetUserId, CancellationToken ct = default);
    Task<IReadOnlyList<AuditLogDto>> GetAuditAsync(int limit, CancellationToken ct = default);
}