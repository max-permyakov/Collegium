using CollegePortal.Domain.Enums;
using Microsoft.AspNetCore.Authorization;

namespace CollegePortal.Infrastructure.Authorization;

public class PermissionRequirement : IAuthorizationRequirement
{
    public PermissionRequirement(Permission permission)
    {
        Permission = permission;
    }

    public Permission Permission { get; }
}
