using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/college-info")]
[Authorize]
public class CollegeInfoController : ControllerBase
{
    private readonly ICollegeInfoService _collegeInfoService;

    public CollegeInfoController(ICollegeInfoService collegeInfoService)
    {
        _collegeInfoService = collegeInfoService;
    }

    [HttpGet("catalog")]
    public async Task<IActionResult> GetCatalog(CancellationToken ct)
    {
        var catalog = await _collegeInfoService.GetCatalogAsync(ct);
        return catalog == null ? Ok(new { groups = Array.Empty<string>(), teachers = Array.Empty<string>(), audiences = Array.Empty<string>() }) : Ok(catalog);
    }

    [HttpGet("schedule/search")]
    public async Task<IActionResult> SearchSchedule(
        [FromQuery] string type,
        [FromQuery] string query,
        [FromQuery] DateTime? date,
        CancellationToken ct)
    {
        if (type is not ("group" or "teacher" or "audience"))
            return BadRequest(new { message = "Параметр type должен быть group, teacher или audience" });

        var result = await _collegeInfoService.SearchScheduleAsync(type, query, date, ct);
        return result == null
            ? NotFound(new { message = "Расписание не найдено" })
            : Ok(result);
    }

    [HttpGet("teachers")]
    public async Task<IActionResult> GetTeachers(CancellationToken ct)
    {
        var teachers = await _collegeInfoService.GetTeachersAsync(ct);
        return Ok(teachers);
    }
}