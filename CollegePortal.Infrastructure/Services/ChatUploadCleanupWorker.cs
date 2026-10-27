using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

/// <summary>
/// Deletes chat uploads that were never attached to a message within the TTL
/// (cancelled or abandoned uploads) together with their on-disk files.
/// </summary>
public class ChatUploadCleanupWorker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(30);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IChatFileStore _fileStore;
    private readonly ILogger<ChatUploadCleanupWorker> _logger;

    public ChatUploadCleanupWorker(
        IServiceScopeFactory scopeFactory,
        IChatFileStore fileStore,
        ILogger<ChatUploadCleanupWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _fileStore = fileStore;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var timer = new PeriodicTimer(Interval);
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await CleanupOnceAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected during shutdown.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Chat upload cleanup worker crashed");
        }
    }

    private async Task CleanupOnceAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();

            var cutoff = DateTime.UtcNow - TimeSpan.FromHours(24);
            var stale = await db.ChatUploads
                .Where(u => u.CreatedAt < cutoff)
                .ToListAsync(ct);

            if (stale.Count == 0)
                return;

            var keys = stale.Select(e => e.StorageKey).Distinct().ToArray();
            db.ChatUploads.RemoveRange(stale);

            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateConcurrencyException ex)
            {
                // A user attached one of the uploads while we were deleting —
                // those keys belong to a live message now; keep their files.
                _logger.LogWarning(ex, "Chat upload cleanup raced with an attachment; skipping this cycle");
                return;
            }

            // Delete files only for keys not referenced by any message (the
            // upload row is gone, but a race may have converted it to one).
            var referenced = await db.ChatMessages.AsNoTracking()
                .Where(m => keys.Contains(m.StorageKey))
                .Select(m => m.StorageKey)
                .ToListAsync(ct);

            var blocked = referenced.ToHashSet();
            foreach (var key in keys.Where(k => !blocked.Contains(k)))
                _fileStore.Delete(key);

            _logger.LogInformation("Removed {Count} expired chat uploads", keys.Length - blocked.Count);
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Chat upload cleanup cycle failed");
        }
    }
}
