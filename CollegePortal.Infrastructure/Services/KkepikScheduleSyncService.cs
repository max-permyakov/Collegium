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

    // kkepik публикует расписание день за днём; кешируем сегодня и неделю вперёд,
    // чтобы на главной и во вкладке "Расписание" всегда показывалось то же
    // расписание, которое выкладывает kkepik (включая аудитории).
    private const int DaysAhead = 6;

    // kkepik разрешает 10 запросов в секунду на IP.
    private static readonly TimeSpan RequestDelay = TimeSpan.FromMilliseconds(250);

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
            for (var offset = 0; offset <= DaysAhead; offset++)
            {
                ct.ThrowIfCancellationRequested();

                // Moscow calendar date (fixed UTC+3, no DST) stored as UTC midnight for
                // consistency with the timestamp-with-time-zone column.
                var targetDate = DateTime.UtcNow.AddHours(3).Date.AddDays(offset);

                ScheduleResponseDto? schedule;
                try
                {
                    schedule = await scheduleApi.GetGroupScheduleAsync(group, targetDate, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Kkepik request failed for {Group} on {Date}", group, targetDate.ToString("yyyy-MM-dd"));
                    continue;
                }

                await Task.Delay(RequestDelay, ct);

                if (schedule == null || schedule.ScheduleLines.Length == 0)
                    continue;

                // kkepik возвращает собственную дату расписания; кешируем ответ
                // именно под неё, а не под запрошенную дату — иначе "актуальный"
                // день может оказаться под ярлыком завтрашнего.
                var effectiveDate = schedule.Date == default
                    ? targetDate
                    : schedule.Date.Date;
                effectiveDate = DateTime.SpecifyKind(effectiveDate, DateTimeKind.Utc);

                await UpsertAsync(db, group, effectiveDate, schedule.ScheduleLines, ct);
            }
        }
    }

    private async Task UpsertAsync(CollegePortalDbContext db, string group, DateTime date, string[] lines, CancellationToken ct)
    {
        var linesJson = JsonSerializer.Serialize(lines);
        var existing = await db.KkepikSchedules
            .FirstOrDefaultAsync(s => s.GroupName == group && s.Date == date, ct);

        if (existing != null)
        {
            if (existing.ScheduleLinesJson == linesJson)
                return; // без изменений — не трогаем UpdatedAt, чтобы он показывал время фактической публикации

            existing.ScheduleLinesJson = linesJson;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            db.KkepikSchedules.Add(new KkepikSchedule
            {
                Id = Guid.NewGuid(),
                GroupName = group,
                Date = date,
                ScheduleLinesJson = linesJson,
                UpdatedAt = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync(ct);
        _logger.LogInformation("Kkepik schedule updated for {Group} on {Date}", group, date.ToString("yyyy-MM-dd"));
    }
}