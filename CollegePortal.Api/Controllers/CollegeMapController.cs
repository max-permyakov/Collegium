using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/college-map")]
[Authorize]
public class CollegeMapController : ControllerBase
{
    private readonly ICollegeMapService _mapService;

    public CollegeMapController(ICollegeMapService mapService)
    {
        _mapService = mapService;
    }

    [HttpGet]
    public async Task<IActionResult> GetMap(CancellationToken ct)
    {
        var map = await _mapService.GetMapAsync(ct);
        return Ok(map);
    }

    [HttpGet("buildings")]
    public async Task<IActionResult> GetBuildings(CancellationToken ct)
    {
        var buildings = await _mapService.GetBuildingsAsync(ct);
        return Ok(buildings);
    }

    [HttpGet("disciplines")]
    public async Task<IActionResult> GetDisciplines(CancellationToken ct)
    {
        var disciplines = await _mapService.GetDisciplinesAsync(ct);
        return Ok(disciplines);
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? query, CancellationToken ct)
    {
        var result = await _mapService.SearchAsync(query ?? string.Empty, ct);
        return Ok(result);
    }
}
