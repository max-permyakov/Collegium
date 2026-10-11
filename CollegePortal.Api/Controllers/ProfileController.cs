using System.Security.Claims;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/profile")]
[Authorize]
public class ProfileController : ControllerBase
{
    private readonly IProfileService _profileService;

    public ProfileController(IProfileService profileService)
    {
        _profileService = profileService;
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMe(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var profile = await _profileService.GetProfileAsync(userId.Value, ct);
        return profile == null ? NotFound() : Ok(profile);
    }

    [HttpPut("me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateProfileRequestDto request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _profileService.UpdateProfileAsync(userId.Value, request, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("me/avatar")]
    public async Task<IActionResult> SetAvatar([FromBody] SetAvatarRequestDto request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var ok = await _profileService.SetAvatarAsync(userId.Value, request.DataUrl, ct);
        return ok ? Ok() : BadRequest(new { message = "Некорректное изображение или размер превышает лимит" });
    }

    [HttpDelete("me/avatar")]
    public async Task<IActionResult> ClearAvatar(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var ok = await _profileService.SetAvatarAsync(userId.Value, null, ct);
        return ok ? Ok() : BadRequest();
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}