using CollegePortal.Domain.Enums;

namespace CollegePortal.Application.DTOs;

public record AdminPermissionsDto(
    Guid UserId,
    string DisplayName,
    string Email,
    bool IsAdmin,
    Permission[] Permissions
);

public record SetAdminPermissionsDto(
    Permission[] Permissions
);
