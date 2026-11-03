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

    /// <summary>
    /// Manual refresh requested by the student: pulls the diary dashboard again
    /// and persists the new average mark in the database, so group ratings read
    /// the stored value without per-user admin recalculations.
    /// </summary>
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _gradesService.RefreshGradesAsync(userId.Value, ct);
        if (result == null)
            return DiaryRequired();

        if (!result.Success)
            return StatusCode(StatusCodes.Status502BadGateway, new { message = result.Error });

        return Ok(new { averageMark = result.AverageMark });
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