namespace CollegePortal.Domain.Entities;

/// <summary>
/// One unlocked achievement ("Достижение") for a user. Achievements are
/// evaluated lazily on profile requests: <see cref="UnlockedAt"/> records when
/// the condition first became true.
/// </summary>
public class UserAchievement
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    /// <summary>Stable achievement code, e.g. "chatter".</summary>
    public string Code { get; set; } = string.Empty;

    public DateTime UnlockedAt { get; set; } = DateTime.UtcNow;

    public ApplicationUser User { get; set; } = null!;
}
