using CollegePortal.Application.DTOs;
using CollegePortal.Domain.Enums;

namespace CollegePortal.Application.Services;

public interface IAdminPermissionService
{
    Task<AdminPermissionsDto?> GetPermissionsAsync(Guid targetUserId, CancellationToken ct = default);
    Task<bool> SetPermissionsAsync(Guid actorUserId, Guid targetUserId, SetAdminPermissionsDto dto, CancellationToken ct = default);
    Task<Permission[]> GetEffectivePermissionsAsync(Guid userId, CancellationToken ct = default);
}
