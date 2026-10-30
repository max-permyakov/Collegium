using CollegePortal.Domain.Enums;

namespace CollegePortal.Domain.Entities;

/// <summary>
/// A message in a direct chat. Text, media (voice / video circle) and file
/// attachments share this table; attachment metadata lives in this row and the
/// binary is stored on disk (see IChatFileStore), not in the database.
/// </summary>
public class ChatMessage
{
    /// <summary>Monotonic bigint id; the stable ordering/pagination key.</summary>
    public long Id { get; set; }

    public Guid ChatId { get; set; }
    public Guid SenderId { get; set; }

    public ChatMessageKind Kind { get; set; } = ChatMessageKind.Text;

    /// <summary>Message body; also a caption for attachments.</summary>
    public string? Text { get; set; }

    /// <summary>Attachment metadata (null for plain text messages).</summary>
    public string? FileName { get; set; }
    public string? ContentType { get; set; }
    public long? SizeBytes { get; set; }

    /// <summary>Relative path of the stored binary inside the chat file root.</summary>
    public string? StorageKey { get; set; }

    /// <summary>Media length for voice notes and video circles, in milliseconds.</summary>
    public int? DurationMs { get; set; }

    /// <summary>Read receipt set by the recipient.</summary>
    public DateTime? ReadAt { get; set; }

    /// <summary>Set when the sender edited the text of a message.</summary>
    public DateTime? EditedAt { get; set; }

    /// <summary>Legacy soft-delete tombstone flag; chat deletions are hard now and leave nothing behind.</summary>
    public DateTime? DeletedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Chat Chat { get; set; } = null!;
    public ApplicationUser Sender { get; set; } = null!;
}
