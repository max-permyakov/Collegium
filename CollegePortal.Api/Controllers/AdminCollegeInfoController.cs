using System.Security.Claims;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/admin/college-info")]
[Authorize(Policy = "Permission.CollegeInfoManage")]
public class AdminCollegeInfoController : ControllerBase
{
    private readonly ICollegeInfoService _collegeInfoService;

    public AdminCollegeInfoController(ICollegeInfoService collegeInfoService)
    {
        _collegeInfoService = collegeInfoService;
    }

    [HttpPost("catalog/refresh")]
    public async Task<IActionResult> RefreshCatalog(CancellationToken ct)
    {
        var result = await _collegeInfoService.RefreshCatalogAsync(ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("teachers/refresh")]
    public async Task<IActionResult> RefreshTeachers(CancellationToken ct)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        var userId = userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var uid) ? uid : Guid.Empty;

        var result = await _collegeInfoService.RefreshTeachersAsync(userId, ct);
        return result.Success ? Ok(new { message = "Список преподавателей обновлён" }) : BadRequest(new { message = result.Error });
    }
}