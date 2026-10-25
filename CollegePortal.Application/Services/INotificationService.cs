using CollegePortal.Application.DTOs;
using CollegePortal.Domain.Enums;

namespace CollegePortal.Application.Services;

public record NotificationMessage(
    NotificationType Type,
    string Title,
    string Body,
    string? Url = null);

/// <summary>Delivery preference for one notification type.</summary>
public record NotificationPreferenceDto(string Type, bool Enabled);

public interface INotificationService
{
    /// <summary>Creates one notification per user and enqueues push delivery.</summary>
    Task NotifyUsersAsync(
        IReadOnlyCollection<Guid> userIds,
        NotificationMessage message,
        CancellationToken ct = default);

    /// <summary>Notifies active students of a study group.</summary>
    Task NotifyStudyGroupAsync(
        Guid studyGroupId,
        NotificationMessage message,
        Guid? excludeUserId = null,
        CancellationToken ct = default);

    /// <summary>
    /// Notifies either all active users or, when <paramref name="studyGroupId"/>
    /// is set, the active students of that group.
    /// </summary>
    Task NotifyAllActiveAsync(
        NotificationMessage message,
        Guid? studyGroupId = null,
        Guid? excludeUserId = null,
        CancellationToken ct = default);

    /// <summary>
    /// Notifies active members of a club except the message author. Club chat
    /// produces many messages, so delivery is aggregated: at most one
    /// notification per club per aggregation window.
    /// </summary>
    Task NotifyClubMembersAsync(
        Guid clubId,
        string clubName,
        NotificationMessage message,
        Guid excludeUserId,
        CancellationToken ct = default);

    /// <summary>Returns the delivery preference of every notifyable type.</summary>
    Task<NotificationPreferenceDto[]> GetPreferencesAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Enables or disables one notification type for the user.</summary>
    Task<NotificationPreferenceDto> SetPreferenceAsync(
        Guid userId,
        NotificationType type,
        bool enabled,
        CancellationToken ct = default);

    Task<NotificationDto[]> GetAsync(
        Guid userId,
        int limit,
        DateTime? before = null,
        CancellationToken ct = default);

    Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default);

    Task<bool> MarkReadAsync(Guid userId, Guid notificationId, CancellationToken ct = default);

    Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default);

    Task<bool> DeleteAsync(Guid userId, Guid notificationId, CancellationToken ct = default);
}
