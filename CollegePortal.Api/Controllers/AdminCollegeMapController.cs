using System.Security.Claims;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/admin/college-map")]
[Authorize(Roles = "Admin")]
public class AdminCollegeMapController : ControllerBase
{
    private readonly ICollegeMapService _mapService;

    public AdminCollegeMapController(ICollegeMapService mapService)
    {
        _mapService = mapService;
    }

    [HttpPost("buildings")]
    public async Task<IActionResult> CreateBuilding([FromBody] CreateBuildingDto dto, CancellationToken ct)
    {
        try
        {
            var building = await _mapService.CreateBuildingAsync(GetCurrentUserId(), dto, ct);
            return Ok(building);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("buildings/{id:guid}")]
    public async Task<IActionResult> UpdateBuilding(Guid id, [FromBody] UpdateBuildingDto dto, CancellationToken ct)
    {
        var result = await _mapService.UpdateBuildingAsync(id, GetCurrentUserId(), dto, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpDelete("buildings/{id:guid}")]
    public async Task<IActionResult> DeleteBuilding(Guid id, CancellationToken ct)
    {
        var result = await _mapService.DeleteBuildingAsync(id, GetCurrentUserId(), ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("auditoriums")]
    public async Task<IActionResult> CreateAuditorium([FromBody] CreateAuditoriumDto dto, CancellationToken ct)
    {
        try
        {
            var auditorium = await _mapService.CreateAuditoriumAsync(GetCurrentUserId(), dto, ct);
            return Ok(auditorium);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("auditoriums/{id:guid}")]
    public async Task<IActionResult> UpdateAuditorium(Guid id, [FromBody] UpdateAuditoriumDto dto, CancellationToken ct)
    {
        var result = await _mapService.UpdateAuditoriumAsync(id, GetCurrentUserId(), dto, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpDelete("auditoriums/{id:guid}")]
    public async Task<IActionResult> DeleteAuditorium(Guid id, CancellationToken ct)
    {
        var result = await _mapService.DeleteAuditoriumAsync(id, GetCurrentUserId(), ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    private Guid GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        return userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId) ? userId : Guid.Empty;
    }
}
