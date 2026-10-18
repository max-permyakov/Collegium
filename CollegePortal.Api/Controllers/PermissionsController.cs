using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/permissions")]
[Authorize]
public class PermissionsController : ControllerBase
{
    private readonly IAdminPermissionService _permissionService;

    public PermissionsController(IAdminPermissionService permissionService)
    {
        _permissionService = permissionService;
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : null;
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMyPermissions(CancellationToken ct)
    {
        var id = GetCurrentUserId();
        if (!id.HasValue) return Unauthorized();
        var perms = await _permissionService.GetEffectivePermissionsAsync(id.Value, ct);
        return Ok(new { permissions = perms });
    }
}

