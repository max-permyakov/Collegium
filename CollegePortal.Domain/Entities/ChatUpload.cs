using CollegePortal.Domain.Enums;

namespace CollegePortal.Domain.Entities;

/// <summary>
/// A file streamed into a chat before a message references it. The upload is
/// confirmed by posting a message with this id, at which point the row is
/// removed and its metadata moves onto the ChatMessage row. Rows older than
/// the TTL are cleaned up by ChatUploadCleanupWorker.
/// </summary>
public class ChatUpload
{
    public Guid Id { get; set; }
    public Guid ChatId { get; set; }
    public Guid UploaderId { get; set; }

    public ChatMessageKind Kind { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string StorageKey { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Chat Chat { get; set; } = null!;
    public ApplicationUser Uploader { get; set; } = null!;
}
