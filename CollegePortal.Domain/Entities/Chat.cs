namespace CollegePortal.Domain.Entities;

/// <summary>
/// A direct (1:1) chat between two users.
/// User1Id/User2Id form a normalized, always ordered pair so the same two
/// users always map to exactly one row (enforced by a unique index).
/// </summary>
public class Chat
{
    public Guid Id { get; set; }

    /// <summary>First participant of the ordered pair (User1Id < User2Id).</summary>
    public Guid User1Id { get; set; }

    /// <summary>Second participant of the ordered pair.</summary>
    public Guid User2Id { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Timestamp of the newest message; null until the first send.</summary>
    public DateTime? LastMessageAt { get; set; }

    public ApplicationUser User1 { get; set; } = null!;
    public ApplicationUser User2 { get; set; } = null!;
    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
}
