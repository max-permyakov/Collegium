using System.Security.Claims;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

/// <summary>
/// Streams avatars decoded from their stored data URLs. Kept separate from the
/// list DTOs so chat/club polling never re-transfers multi-megabyte base64, and
/// so the browser can cache each avatar like a normal image.
/// </summary>
[ApiController]
[Route("api/avatars")]
[Authorize]
public class AvatarsController : ControllerBase
{
    // Long enough to survive many 5-second polls, short enough that a changed
    // avatar shows up for other users within minutes.
    private const int CacheSeconds = 60 * 5;

    private readonly IAvatarService _avatarService;

    public AvatarsController(IAvatarService avatarService)
    {
        _avatarService = avatarService;
    }

    private bool IsAdmin => User.IsInRole("Admin");

    [HttpGet("users/{userId:guid}")]
    public async Task<IActionResult> GetUserAvatar(Guid userId, CancellationToken ct)
    {
        if (!GetCurrentUserId().HasValue)
            return Unauthorized();

        var image = await _avatarService.GetUserAvatarAsync(userId, ct);
        return image == null ? NotFound() : AvatarFile(image);
    }

    [HttpGet("clubs/{clubId:guid}")]
    public async Task<IActionResult> GetClubAvatar(Guid clubId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var image = await _avatarService.GetClubAvatarAsync(clubId, userId.Value, IsAdmin, ct);
        return image == null ? NotFound() : AvatarFile(image);
    }

    private IActionResult AvatarFile(AvatarImage image)
    {
        Response.Headers.CacheControl = $"private, max-age={CacheSeconds}";

        return new FileContentResult(image.Bytes, image.ContentType)
        {
            LastModified = image.LastModified
        };
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}
