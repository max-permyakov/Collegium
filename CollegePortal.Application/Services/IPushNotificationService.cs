namespace CollegePortal.Application.Services;

public record PushPayload(
    string Title,
    string Body,
    string? Url = null,
    string? Tag = null,
    Guid? NotificationId = null,
    string? Type = null);

public record PushSendResult(int Sent, int Removed, int Failed);

public interface IPushNotificationService
{
    /// <summary>
    /// Delivers a push message to every active subscription of the user.
    /// Removes dead subscriptions (404/410) and reports delivery counts.
    /// </summary>
    Task<PushSendResult> SendToUserAsync(
        Guid userId,
        PushPayload payload,
        CancellationToken ct = default);
}
