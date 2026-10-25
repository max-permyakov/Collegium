using System.Net;
using System.Text.Json;
using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.ExternalApis.Notifications;
using Lib.Net.Http.WebPush;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WebPushSubscription = Lib.Net.Http.WebPush.PushSubscription;

namespace CollegePortal.Infrastructure.Services;

public class PushNotificationService : IPushNotificationService
{
    private const int MaxDeliveryAttempts = 3;
    private const int InvalidSubscriptionFailureLimit = 3;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(500);

    private readonly CollegePortalDbContext _db;
    private readonly PushServiceClient _pushClient;
    private readonly PushServiceClientOptions _options;
    private readonly ILogger<PushNotificationService> _logger;

    public PushNotificationService(
        CollegePortalDbContext db,
        PushServiceClient pushClient,
        IOptions<PushServiceClientOptions> options,
        ILogger<PushNotificationService> logger)
    {
        _db = db;
        _pushClient = pushClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<PushSendResult> SendToUserAsync(
        Guid userId,
        PushPayload payload,
        CancellationToken ct = default)
    {
        if (!_options.IsConfigured)
        {
            _logger.LogWarning(
                "Push delivery skipped for user {UserId}: VAPID keys are not configured",
                userId);
            return new PushSendResult(0, 0, 0);
        }

        var subscriptions = await _db.PushSubscriptions
            .Where(s => s.UserId == userId)
            .ToListAsync(ct);

        if (subscriptions.Count == 0)
            return new PushSendResult(0, 0, 0);

        // The service worker understands this shape and either shows a system
        // notification or forwards it to an open tab as an in-app toast.
        var messageBody = JsonSerializer.Serialize(new
        {
            title = payload.Title,
            body = payload.Body,
            data = new
            {
                url = payload.Url ?? "/",
                notificationId = payload.NotificationId,
                type = payload.Type,
                tag = payload.Tag
            }
        });

        var sent = 0;
        var removed = 0;
        var failed = 0;

        foreach (var subscription in subscriptions)
        {
            var pushSubscription = new WebPushSubscription
            {
                Endpoint = subscription.Endpoint,
                Keys = new Dictionary<string, string>
                {
                    ["p256dh"] = subscription.P256DH,
                    ["auth"] = subscription.Auth
                }
            };

            var message = new PushMessage(messageBody)
            {
                Urgency = PushMessageUrgency.Normal,
                TimeToLive = 60 * 60 * 24 // сутки
            };

            var outcome = await TryDeliverAsync(
                userId,
                subscription.Id,
                pushSubscription,
                message,
                ct);

            switch (outcome)
            {
                case DeliveryOutcome.Sent:
                    sent++;
                    subscription.FailureCount = 0;
                    subscription.LastSuccessAt = DateTime.UtcNow;
                    break;

                case DeliveryOutcome.Gone:
                    _db.PushSubscriptions.Remove(subscription);
                    removed++;
                    break;

                case DeliveryOutcome.InvalidKeys:
                    subscription.FailureCount++;
                    if (subscription.FailureCount >= InvalidSubscriptionFailureLimit)
                    {
                        _db.PushSubscriptions.Remove(subscription);
                        removed++;
                    }

                    break;

                case DeliveryOutcome.Failed:
                    failed++;
                    break;
            }
        }

        await _db.SaveChangesAsync(ct);

        if (removed > 0)
        {
            _logger.LogInformation(
                "Removed {Count} dead push subscriptions for user {UserId}",
                removed,
                userId);
        }

        return new PushSendResult(sent, removed, failed);
    }

    private enum DeliveryOutcome
    {
        Sent,
        Gone,
        InvalidKeys,
        Failed
    }

    private async Task<DeliveryOutcome> TryDeliverAsync(
        Guid userId,
        Guid subscriptionId,
        WebPushSubscription pushSubscription,
        PushMessage message,
        CancellationToken ct)
    {
        for (var attempt = 1; attempt <= MaxDeliveryAttempts; attempt++)
        {
            try
            {
                await _pushClient.RequestPushMessageDeliveryAsync(pushSubscription, message, ct);
                return DeliveryOutcome.Sent;
            }
            catch (PushServiceClientException ex) when (IsGone(ex))
            {
                _logger.LogInformation(
                    "Push endpoint for user {UserId} is gone ({Status}); removing subscription {SubscriptionId}",
                    userId,
                    (int)ex.StatusCode,
                    subscriptionId);
                return DeliveryOutcome.Gone;
            }
            catch (PushServiceClientException ex) when (ex.StatusCode == HttpStatusCode.BadRequest)
            {
                _logger.LogWarning(
                    ex,
                    "Push subscription {SubscriptionId} for user {UserId} has invalid keys",
                    subscriptionId,
                    userId);
                return DeliveryOutcome.InvalidKeys;
            }
            catch (PushServiceClientException ex) when (IsTransient(ex) && attempt < MaxDeliveryAttempts)
            {
                _logger.LogWarning(
                    ex,
                    "Transient push failure for user {UserId} ({Status}), retrying ({Attempt}/{Max})",
                    userId,
                    (int)ex.StatusCode,
                    attempt,
                    MaxDeliveryAttempts);
                await Task.Delay(RetryDelay * attempt, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Push delivery failed for user {UserId} and subscription {SubscriptionId}",
                    userId,
                    subscriptionId);
                return DeliveryOutcome.Failed;
            }
        }

        return DeliveryOutcome.Failed;
    }

    private static bool IsGone(PushServiceClientException ex) =>
        ex.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound;

    private static bool IsTransient(PushServiceClientException ex) =>
        ex.StatusCode == HttpStatusCode.TooManyRequests ||
        (int)ex.StatusCode >= 500;
}
