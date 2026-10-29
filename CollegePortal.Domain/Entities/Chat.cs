using CollegePortal.Domain.Enums;

namespace CollegePortal.Domain.Entities;

/// <summary>
/// A 1:1 chat between two users. User1Id/User2Id form a normalized, always
/// ordered pair so the same two users always map to exactly one Direct row
/// (enforced by a unique index on the pair + Kind). Saved and Support chats are
/// self-paired and exist once per user.
/// </summary>
public class Chat
{
    public Guid Id { get; set; }

    /// <summary>Direct conversation, personal notes or support thread.</summary>
    public ChatKind Kind { get; set; } = ChatKind.Direct;

    /// <summary>First participant; for Saved/Support chats both ids equal the owner.</summary>
    public Guid User1Id { get; set; }

    /// <summary>Second participant of the ordered pair (equal to User1Id for special chats).</summary>
    public Guid User2Id { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Timestamp of the newest message; null until the first send.</summary>
    public DateTime? LastMessageAt { get; set; }

    public ApplicationUser User1 { get; set; } = null!;
    public ApplicationUser User2 { get; set; } = null!;
    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
}
