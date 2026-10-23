using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IGameService
{
    /// <summary>Returns null when the game/mode pair is unknown.</summary>
    Task<GameLeaderboardDto?> GetLeaderboardAsync(Guid userId, string gameId, string mode, CancellationToken ct = default);

    /// <summary>Registers a finished run. Returns null when the game/mode pair is unknown.</summary>
    Task<GameScoreSubmissionDto?> SubmitScoreAsync(Guid userId, string gameId, string mode, int score, CancellationToken ct = default);
}
