using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/grades")]
[Authorize]
public class GradesController : ControllerBase
{
    private readonly IGradesService _gradesService;

    public GradesController(IGradesService gradesService)
    {
        _gradesService = gradesService;
    }

    [HttpGet]
    public async Task<IActionResult> GetGrades()
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var grades = await _gradesService.GetGradesAsync(userId.Value);
        
        if (grades == null)
            return DiaryRequired();

        return Ok(grades);
    }

    [HttpGet("performance")]
    public async Task<IActionResult> GetPerformance()
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var performance = await _gradesService.GetPerformanceAsync(userId.Value);
        
        if (performance == null)
            return DiaryRequired();

        return Ok(performance);
    }

    private ObjectResult DiaryRequired() => StatusCode(
        StatusCodes.Status403Forbidden,
        new { code = "diary_required", message = "Оценки доступны после привязки дневника" });

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}