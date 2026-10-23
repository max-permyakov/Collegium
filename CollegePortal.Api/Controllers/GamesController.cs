using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/games")]
[Authorize]
public class GamesController : ControllerBase
{
    private readonly IGameService _gameService;

    public GamesController(IGameService gameService)
    {
        _gameService = gameService;
    }

    [HttpGet("{gameId}/leaderboard")]
    public async Task<IActionResult> GetLeaderboard(
        [FromRoute] string gameId,
        [FromQuery] string mode,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue) return Unauthorized();

        var leaderboard = await _gameService.GetLeaderboardAsync(userId.Value, gameId, mode ?? string.Empty, ct);
        if (leaderboard == null) return UnknownGame(gameId, mode);

        return Ok(leaderboard);
    }

    [HttpPost("{gameId}/score")]
    public async Task<IActionResult> SubmitScore(
        [FromRoute] string gameId,
        [FromBody] GameScoreSubmissionRequestDto request,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue) return Unauthorized();

        if (request == null || string.IsNullOrWhiteSpace(request.Mode) || request.Score < 0)
            return BadRequest(new { code = "invalid_request", message = "Некорректные данные результата" });

        var result = await _gameService.SubmitScoreAsync(userId.Value, gameId, request.Mode, request.Score, ct);
        if (result == null) return UnknownGame(gameId, request.Mode);

        return Ok(result);
    }

    private ObjectResult UnknownGame(string gameId, string? mode) => BadRequest(new
    {
        code = "unknown_game",
        message = $"Неизвестная игра {gameId} или режим {mode}"
    });

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId)) return userId;
        return null;
    }
}
