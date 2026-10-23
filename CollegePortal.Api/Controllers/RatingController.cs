using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/rating")]
[Authorize]
public class RatingController : ControllerBase
{
    private readonly IRatingService _ratingService;

    public RatingController(IRatingService ratingService)
    {
        _ratingService = ratingService;
    }

    [HttpGet("group")]
    public async Task<IActionResult> GetGroupRating([FromQuery] string? subject, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue) return Unauthorized();

        var rating = await _ratingService.GetGroupRatingAsync(userId.Value, subject, ct);
        if (rating == null)
            return DiaryRequired();

        return Ok(rating);
    }

    [HttpPost("participate")]
    public async Task<IActionResult> SetParticipation([FromBody] RatingParticipationRequestDto request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue) return Unauthorized();

        var result = await _ratingService.SetParticipationAsync(userId.Value, request.Enabled, ct);
        if (result == null)
            return DiaryRequired();

        return Ok(result);
    }

    private ObjectResult DiaryRequired() => StatusCode(
        StatusCodes.Status403Forbidden,
        new { code = "diary_required", message = "Рейтинг доступен после привязки дневника" });

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId)) return userId;
        return null;
    }
}
