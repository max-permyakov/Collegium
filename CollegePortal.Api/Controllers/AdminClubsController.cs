using System.Security.Claims;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/admin/clubs")]
[Authorize(Roles = "Admin")]
public class AdminClubsController : ControllerBase
{
    private readonly IClubService _clubService;

    public AdminClubsController(IClubService clubService)
    {
        _clubService = clubService;
    }

    [HttpGet]
    public async Task<IActionResult> GetClubs(CancellationToken ct)
    {
        var clubs = await _clubService.GetAllForAdminAsync(ct);
        return Ok(clubs);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetClub(Guid id, CancellationToken ct)
    {
        var club = await _clubService.GetForAdminAsync(id, ct);
        return club == null ? NotFound() : Ok(club);
    }

    [HttpGet("{id:guid}/messages")]
    public async Task<IActionResult> GetMessages(Guid id, CancellationToken ct)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        var userId = userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var uid) ? uid : Guid.Empty;

        var messages = await _clubService.GetMessagesAsync(id, userId, isAdmin: true, ct);
        return messages == null ? NotFound() : Ok(messages);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteClub(Guid id, CancellationToken ct)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        var userId = userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var uid) ? uid : Guid.Empty;

        var result = await _clubService.DeleteAsync(id, userId, isAdmin: true, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }
}
