using CollegePortal.Application.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Notifications;

/// <summary>
/// Delivers notifications for scheduled news whose <c>PublishedAt</c> has
/// matured. Actual visibility is computed from <c>IsPublished/PublishedAt</c>,
/// so no row state changes here — the job only fans out notifications once,
/// guarded by <c>Announcement.NotifiedAtUtc</c>.
/// </summary>
public sealed class AnnouncementPublicationWorker : BackgroundService
{
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AnnouncementPublicationWorker> _logger;

    public AnnouncementPublicationWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<AnnouncementPublicationWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app finish starting; tests usually exit before this fires.
        await Task.Delay(InitialDelay, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var announcements = scope.ServiceProvider.GetRequiredService<IAnnouncementService>();
                var delivered = await announcements.NotifyDueAsync(stoppingToken);

                if (delivered > 0)
                {
                    _logger.LogInformation(
                        "Delivered notifications for {Count} scheduled announcements",
                        delivered);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scheduled announcement publication check failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }
}
