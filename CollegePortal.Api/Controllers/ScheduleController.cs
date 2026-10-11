using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/schedule")]
[Authorize]
public class ScheduleController : ControllerBase
{
    private readonly IScheduleService _scheduleService;

    public ScheduleController(IScheduleService scheduleService)
    {
        _scheduleService = scheduleService;
    }

    [HttpGet("day")]
    public async Task<IActionResult> GetScheduleForDay([FromQuery] DateTime? date = null)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var targetDate = date ?? DateTime.Today;
        var schedule = await _scheduleService.GetScheduleForDayAsync(userId.Value, targetDate);
        
        if (schedule == null)
            return NotFound(new { message = "Профиль студента не найден или расписание недоступно" });

        return Ok(schedule);
    }

    [HttpGet("week")]
    public async Task<IActionResult> GetScheduleForWeek([FromQuery] DateTime? startDate = null)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var targetStartDate = startDate ?? DateTime.Today;
        var schedule = await _scheduleService.GetScheduleForWeekAsync(userId.Value, targetStartDate);
        
        if (schedule == null)
            return NotFound(new { message = "Профиль студента не найден или расписание недоступно" });

        return Ok(schedule);
    }

    [HttpGet("group/week")]
    [AllowAnonymous]
    public async Task<IActionResult> GetGroupScheduleForWeek([FromQuery] string group, [FromQuery] DateTime? startDate = null)
    {
        if (string.IsNullOrWhiteSpace(group))
            return BadRequest(new { message = "Не указано название группы" });

        var targetStartDate = startDate ?? DateTime.Today;
        var schedule = await _scheduleService.GetGroupScheduleForWeekAsync(group, targetStartDate);
        
        if (schedule == null)
            return NotFound(new { message = "Группа не найдена или расписание недоступно" });

        return Ok(schedule);
    }

    [HttpGet("kkepik")]
    public async Task<IActionResult> GetKkepikSchedule([FromQuery] DateTime? date = null)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var schedule = await _scheduleService.GetKkepikScheduleAsync(userId.Value, date);

        if (schedule == null)
            return NotFound(new { message = "Колледж пока не опубликовал актуальное расписание (kkepik)" });

        return Ok(schedule);
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}