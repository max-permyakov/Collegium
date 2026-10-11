using System.Text.Json;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.ExternalApis.Schedule;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class KkepikScheduleSyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<KkepikScheduleSyncService> _logger;
    private readonly TimeSpan _interval = TimeSpan.FromMinutes(30);

    public KkepikScheduleSyncService(
        IServiceScopeFactory scopeFactory,
        ILogger<KkepikScheduleSyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await TrySyncAsync(stoppingToken);

        using var timer = new PeriodicTimer(_interval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (await timer.WaitForNextTickAsync(stoppingToken))
                {
                    await TrySyncAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Kkepik schedule sync failed");
            }
        }
    }

    public async Task<bool> TrySyncAsync(CancellationToken ct)
    {
        try
        {
            await SyncOnceAsync(ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Kkepik schedule sync attempt failed");
            return false;
        }
    }

    private async Task SyncOnceAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();
        var scheduleApi = scope.ServiceProvider.GetRequiredService<ScheduleApiClient>();

        var groups = await db.StudyGroups
            .AsNoTracking()
            .Where(g => g.Students.Any())
            .Select(g => g.Name)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .ToListAsync(ct);

        foreach (var group in groups)
        {
            // kkepik публикует актуальное расписание на ближайший учебный день;
            // смотрим сегодня+завтра, чтобы покрыть выходные и переносы.
            for (var offset = 1; offset <= 2; offset++)
            {
                var targetDate = DateTime.Today.AddDays(offset).Date;
                var schedule = await scheduleApi.GetGroupScheduleAsync(group, targetDate, ct);
                if (schedule == null || schedule.ScheduleLines.Length == 0)
                    continue;

                var linesJson = JsonSerializer.Serialize(schedule.ScheduleLines);
                var existing = await db.KkepikSchedules
                    .FirstOrDefaultAsync(s => s.GroupName == group && s.Date == targetDate, ct);

                if (existing != null)
                {
                    existing.ScheduleLinesJson = linesJson;
                    existing.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    db.KkepikSchedules.Add(new KkepikSchedule
                    {
                        Id = Guid.NewGuid(),
                        GroupName = group,
                        Date = targetDate,
                        ScheduleLinesJson = linesJson,
                        UpdatedAt = DateTime.UtcNow
                    });
                }

                await db.SaveChangesAsync(ct);
                _logger.LogInformation("Kkepik schedule updated for {Group} on {Date}", group, targetDate.ToString("yyyy-MM-dd"));
                break;
            }
        }
    }
}