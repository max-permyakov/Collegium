namespace CollegePortal.Domain.Entities;

public class GameScore
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    /// <summary>Short game identifier, e.g. "escape".</summary>
    public string GameId { get; set; } = string.Empty;

    /// <summary>Game-level mode, e.g. "physics" or "1c".</summary>
    public string Mode { get; set; } = string.Empty;

    /// <summary>Personal best score for the user in this game and mode.</summary>
    public int Score { get; set; }

    /// <summary>When the current best score was set.</summary>
    public DateTime BestAt { get; set; } = DateTime.UtcNow;

    public ApplicationUser User { get; set; } = null!;
}
