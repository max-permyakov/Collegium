using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CollegePortal.Infrastructure.Services;

public class GameService : IGameService
{
    private const int MaxScore = 100_000;
    private const int LeaderboardSize = 20;

    // Allowed game ids with their game-level modes. Scores and leaderboards
    // are scoped by this pair so new games and modes can be added here only.
    private static readonly IReadOnlyDictionary<string, string[]> Games =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["escape"] = new[] { "physics", "1c" },
        };

    private readonly CollegePortalDbContext _dbContext;

    public GameService(CollegePortalDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<GameLeaderboardDto?> GetLeaderboardAsync(Guid userId, string gameId, string mode, CancellationToken ct = default)
    {
        if (!IsKnownMode(gameId, mode)) return Task.FromResult<GameLeaderboardDto?>(null);

        return GetLeaderboardInternalAsync(userId, gameId, mode, ct);
    }

    private async Task<GameLeaderboardDto?> GetLeaderboardInternalAsync(Guid userId, string gameId, string mode, CancellationToken ct)
    {
        var entries = await _dbContext.GameScores
            .AsNoTracking()
            .Where(s => s.GameId == gameId && s.Mode == mode)
            .OrderByDescending(s => s.Score)
            .ThenBy(s => s.BestAt)
            .Take(LeaderboardSize)
            .Select(s => new { s.UserId, s.User.DisplayName, s.Score, s.BestAt })
            .ToListAsync(ct);

        var leaderboardEntries = entries
            .Select((e, index) => new GameLeaderboardEntryDto(
                e.UserId,
                string.IsNullOrWhiteSpace(e.DisplayName) ? "Студент" : e.DisplayName,
                e.Score,
                index + 1,
                e.UserId == userId,
                e.BestAt))
            .ToArray();

        int? currentUserRank = null;
        int? currentUserBest = null;

        var own = await _dbContext.GameScores
            .AsNoTracking()
            .Where(s => s.GameId == gameId && s.Mode == mode && s.UserId == userId)
            .Select(s => new { s.Score })
            .FirstOrDefaultAsync(ct);
        if (own != null)
        {
            currentUserBest = own.Score;
            var higherCount = await _dbContext.GameScores
                .AsNoTracking()
                .Where(s => s.GameId == gameId && s.Mode == mode && s.Score > own.Score)
                .CountAsync(ct);
            currentUserRank = higherCount + 1;
        }

        return new GameLeaderboardDto(gameId, mode, leaderboardEntries, currentUserRank, currentUserBest);
    }

    public async Task<GameScoreSubmissionDto?> SubmitScoreAsync(Guid userId, string gameId, string mode, int score, CancellationToken ct = default)
    {
        if (!IsKnownMode(gameId, mode)) return null;

        score = Math.Clamp(score, 0, MaxScore);

        // One row per user, game and mode stores the personal best; a lower
        // result of the same run simply reports the unchanged best.
        var existing = await _dbContext.GameScores
            .FirstOrDefaultAsync(s => s.GameId == gameId && s.Mode == mode && s.UserId == userId, ct);

        if (existing == null)
        {
            existing = new Domain.Entities.GameScore
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                GameId = gameId,
                Mode = mode,
                Score = score,
                BestAt = DateTime.UtcNow,
            };
            _dbContext.GameScores.Add(existing);
            await _dbContext.SaveChangesAsync(ct);
        }
        else if (score > existing.Score)
        {
            existing.Score = score;
            existing.BestAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(ct);
        }

        var rank = await _dbContext.GameScores
            .AsNoTracking()
            .Where(s => s.GameId == gameId && s.Mode == mode && s.Score > existing.Score)
            .CountAsync(ct);

        return new GameScoreSubmissionDto(
            score,
            existing.Score,
            score >= existing.Score,
            rank + 1);
    }

    private static bool IsKnownMode(string gameId, string mode)
    {
        if (!Games.TryGetValue(gameId, out var modes)) return false;
        return modes.Contains(mode, StringComparer.OrdinalIgnoreCase);
    }
}
