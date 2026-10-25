using CollegePortal.Domain.Enums;

namespace CollegePortal.Domain.Entities;

/// <summary>
/// Opt-out preference for a notification type. A missing row means the type is
/// enabled, so only disabled types are stored.
/// </summary>
public class NotificationPreference
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    public NotificationType Type { get; set; }
    public bool IsDisabled { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
