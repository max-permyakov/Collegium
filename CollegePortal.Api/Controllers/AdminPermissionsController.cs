using System.Security.Claims;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/admin/permissions")]
[Authorize(Policy = "Permission.UsersManage")]
public class AdminPermissionsController : ControllerBase
{
    private readonly IAdminPermissionService _permissionService;

    public AdminPermissionsController(IAdminPermissionService permissionService)
    {
        _permissionService = permissionService;
    }

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> GetPermissions(Guid userId, CancellationToken ct)
    {
        var result = await _permissionService.GetPermissionsAsync(userId, ct);
        return result == null ? NotFound() : Ok(result);
    }

    [HttpPut("{userId:guid}")]
    public async Task<IActionResult> SetPermissions(Guid userId, [FromBody] SetAdminPermissionsDto dto, CancellationToken ct)
    {
        var actorId = GetCurrentUserId();
        if (!actorId.HasValue)
            return Unauthorized();

        var success = await _permissionService.SetPermissionsAsync(actorId.Value, userId, dto, ct);
        return success ? Ok() : BadRequest(new { message = "Выдать или отозвать права может только первичный администратор" });
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        return claim != null && Guid.TryParse(claim.Value, out var id) ? id : null;
    }
}
