using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CollegePortal.Infrastructure.Authorization;

public class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    private readonly IServiceScopeFactory _scopeFactory;

    public PermissionAuthorizationHandler(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        var userIdClaim = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var userId))
            return;

        using var scope = _scopeFactory.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var dbContext = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();

        var user = await userManager.FindByIdAsync(userId.ToString());
        if (user == null || !user.IsActive)
            return;

        // Full admins implicitly hold every permission.
        if (await userManager.IsInRoleAsync(user, "Admin"))
        {
            context.Succeed(requirement);
            return;
        }

        var hasPermission = await dbContext.UserPermissions.AsNoTracking()
            .AnyAsync(up => up.UserId == userId && up.Permission == requirement.Permission);

        if (hasPermission)
            context.Succeed(requirement);
    }
}
