using System.Security.Claims;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/clubs")]
[Authorize]
public class ClubsController : ControllerBase
{
    private readonly IClubService _clubService;

    public ClubsController(IClubService clubService)
    {
        _clubService = clubService;
    }

    private bool IsAdmin => User.IsInRole("Admin");

    [HttpGet]
    public async Task<IActionResult> GetClubs(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var clubs = await _clubService.GetVisibleAsync(userId.Value, IsAdmin, ct);
        return Ok(clubs);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetClub(Guid id, [FromQuery] string? invite, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var club = await _clubService.GetAsync(id, userId.Value, IsAdmin, invite, ct);
        return club == null ? NotFound(new { message = "Группа не найдена или закрыта" }) : Ok(club);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateClubDto dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        try
        {
            var club = await _clubService.CreateAsync(userId.Value, dto, ct);
            return CreatedAtAction(nameof(GetClub), new { id = club.Id }, club);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateClubDto dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _clubService.UpdateAsync(id, userId.Value, IsAdmin, dto, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _clubService.DeleteAsync(id, userId.Value, IsAdmin, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("{id:guid}/join")]
    public async Task<IActionResult> Join(Guid id, [FromBody] JoinClubDto? dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _clubService.JoinAsync(id, userId.Value, dto?.Token, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("{id:guid}/leave")]
    public async Task<IActionResult> Leave(Guid id, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _clubService.LeaveAsync(id, userId.Value, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("{id:guid}/members/{memberId:guid}/leader")]
    public async Task<IActionResult> SetLeader(Guid id, Guid memberId, [FromBody] SetClubLeaderDto dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _clubService.SetLeaderAsync(id, userId.Value, memberId, dto.IsLeader, IsAdmin, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpDelete("{id:guid}/members/{memberId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _clubService.RemoveMemberAsync(id, userId.Value, memberId, IsAdmin, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpGet("{id:guid}/messages")]
    public async Task<IActionResult> GetMessages(Guid id, [FromQuery] string? after, [FromQuery] string? before, [FromQuery] int? latest, [FromQuery] int? limit, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var messages = await _clubService.GetMessagesAsync(id, userId.Value, IsAdmin, after, before, latest, limit, ct);
        return messages == null ? Forbid() : Ok(messages);
    }

    [HttpPost("{id:guid}/messages")]
    public async Task<IActionResult> PostMessage(Guid id, [FromBody] CreateClubMessageDto dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var message = await _clubService.PostMessageAsync(id, userId.Value, dto.Text, ct);
        return message == null ? Forbid() : Ok(message);
    }

    [HttpPost("{id:guid}/pin")]
    public async Task<IActionResult> SetPinned(Guid id, [FromBody] SetClubPinDto dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _clubService.SetPinnedAsync(id, userId.Value, IsAdmin, dto.IsPinned, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPut("messages/{messageId:guid}")]
    public async Task<IActionResult> UpdateMessage(Guid messageId, [FromBody] CreateClubMessageDto dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var message = await _clubService.UpdateMessageAsync(messageId, userId.Value, IsAdmin, dto.Text, ct);
        return message == null ? BadRequest(new { message = "Не удалось обновить сообщение" }) : Ok(message);
    }

    [HttpDelete("messages/{messageId:guid}")]
    public async Task<IActionResult> DeleteMessage(Guid messageId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _clubService.DeleteMessageAsync(messageId, userId.Value, IsAdmin, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}
