using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Notifications;

/// <summary>
/// Delivers queued notifications in the background and uses the
/// <c>Notification.PushSentAt</c> column as an outbox cursor, so notifications
/// created just before a process restart are still delivered.
/// </summary>
public sealed class PushDeliveryWorker : BackgroundService
{
    private const int MaxPushAttempts = 3;
    private const int OutboxBatchSize = 200;

    private readonly NotificationQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PushDeliveryWorker> _logger;

    public PushDeliveryWorker(
        NotificationQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<PushDeliveryWorker> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.WhenAll(
            ProcessQueueAsync(stoppingToken),
            SweepOutboxAsync(stoppingToken),
            CleanupAsync(stoppingToken));
    }

    private async Task ProcessQueueAsync(CancellationToken ct)
    {
        try
        {
            await foreach (var notificationId in _queue.ReadAllAsync(ct))
            {
                try
                {
                    await DeliverAsync(notificationId, ct);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "Unhandled error while delivering notification {NotificationId}",
                        notificationId);
                    await MarkFailedAttemptAsync(notificationId);
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }

    private async Task DeliverAsync(Guid notificationId, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();
        var push = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();

        var notification = await db.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId, ct);

        if (notification is null || notification.PushSentAt is not null)
            return;

        var result = await push.SendToUserAsync(
            notification.UserId,
            new PushPayload(
                notification.Title,
                notification.Body,
                notification.Url,
                Tag: $"cp-{notification.Id}",
                NotificationId: notification.Id,
                Type: notification.Type.ToString()),
            ct);

        notification.PushAttempts++;

        // "Sent" only when at least one subscription accepted the message, or
        // when the user has no subscriptions at all (nothing to retry). If
        // every delivery failed transiently, leave PushSentAt empty so the
        // outbox sweeper retries later.
        if (result.Sent > 0 || result.Failed == 0 || notification.PushAttempts >= MaxPushAttempts)
        {
            notification.PushSentAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SweepOutboxAsync(CancellationToken ct)
    {
        try
        {
            // Let the app finish starting; tests usually exit before this fires.
            await Task.Delay(TimeSpan.FromSeconds(30), ct);

            while (!ct.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();

                    var cutoff = DateTime.UtcNow.AddMinutes(-1);
                    var pendingIds = await db.Notifications
                        .AsNoTracking()
                        .Where(n =>
                            n.PushSentAt == null &&
                            n.PushAttempts < MaxPushAttempts &&
                            n.CreatedAt <= cutoff)
                        .OrderBy(n => n.CreatedAt)
                        .Take(OutboxBatchSize)
                        .Select(n => n.Id)
                        .ToArrayAsync(ct);

                    foreach (var id in pendingIds)
                        _queue.Enqueue(id);

                    if (pendingIds.Length > 0)
                    {
                        _logger.LogInformation(
                            "Outbox sweep enqueued {Count} pending notifications",
                            pendingIds.Length);
                    }
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Notification outbox sweep failed");
                }

                await Task.Delay(TimeSpan.FromMinutes(1), ct);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }

    private async Task CleanupAsync(CancellationToken ct)
    {
        try
        {
            await Task.Delay(TimeSpan.FromMinutes(10), ct);

            while (!ct.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();

                    var now = DateTime.UtcNow;
                    var readCutoff = now.AddDays(-90);
                    var allCutoff = now.AddDays(-180);
                    var staleSubscriptionCutoff = now.AddDays(-180);

                    var deleted = await db.Notifications
                        .Where(n =>
                            (n.IsRead && n.CreatedAt < readCutoff) ||
                            n.CreatedAt < allCutoff)
                        .ExecuteDeleteAsync(ct);

                    var staleSubscriptions = await db.PushSubscriptions
                        .Where(s =>
                            s.CreatedAt < staleSubscriptionCutoff &&
                            (s.LastSuccessAt == null || s.LastSuccessAt < staleSubscriptionCutoff))
                        .ExecuteDeleteAsync(ct);

                    if (deleted > 0 || staleSubscriptions > 0)
                    {
                        _logger.LogInformation(
                            "Notification cleanup removed {Notifications} notifications and {Subscriptions} stale subscriptions",
                            deleted,
                            staleSubscriptions);
                    }
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Notification cleanup failed");
                }

                await Task.Delay(TimeSpan.FromHours(6), ct);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }

    private async Task MarkFailedAttemptAsync(Guid notificationId)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();

            var notification = await db.Notifications
                .FirstOrDefaultAsync(n => n.Id == notificationId);

            if (notification is null || notification.PushSentAt is not null)
                return;

            notification.PushAttempts++;
            if (notification.PushAttempts >= MaxPushAttempts)
                notification.PushSentAt = DateTime.UtcNow;

            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to record push attempt for notification {NotificationId}",
                notificationId);
        }
    }
}
