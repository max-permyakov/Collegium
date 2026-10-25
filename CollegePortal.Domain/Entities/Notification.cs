using CollegePortal.Domain.Enums;

namespace CollegePortal.Domain.Entities;

public class Notification
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    public NotificationType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;

    // Relative SPA path (e.g. "/news"). Absolute and protocol-relative URLs are
    // rejected by the notification service so the service worker can never be
    // used as an open redirect.
    public string? Url { get; set; }

    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Outbox fields used by the background push delivery worker.
    public DateTime? PushSentAt { get; set; }
    public int PushAttempts { get; set; }
}
