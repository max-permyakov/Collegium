using System.Text.Json;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.ExternalApis.Gosuslugi;
using CollegePortal.Infrastructure.ExternalApis.Schedule;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class CollegeInfoService : ICollegeInfoService
{
    private const string CatalogCacheKey = "college-info:catalog";
    private static readonly TimeSpan CatalogCacheTtl = TimeSpan.FromHours(1);

    private readonly CollegePortalDbContext _dbContext;
    private readonly ScheduleApiClient _scheduleApi;
    private readonly GosuslugiStaffClient _staffClient;
    private readonly IMemoryCache _cache;
    private readonly ILogger<CollegeInfoService> _logger;

    public CollegeInfoService(
        CollegePortalDbContext dbContext,
        ScheduleApiClient scheduleApi,
        GosuslugiStaffClient staffClient,
        IMemoryCache cache,
        ILogger<CollegeInfoService> logger)
    {
        _dbContext = dbContext;
        _scheduleApi = scheduleApi;
        _staffClient = staffClient;
        _cache = cache;
        _logger = logger;
    }

    public async Task<CollegeCatalogDto?> GetCatalogAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(CatalogCacheKey, out CollegeCatalogDto? cached) && cached != null)
            return cached;

        var dto = await FetchCatalogAsync(ct);
        if (dto != null)
            _cache.Set(CatalogCacheKey, dto, CatalogCacheTtl);

        return dto;
    }

    public async Task<CollegeInfoActionResult> RefreshCatalogAsync(CancellationToken ct = default)
    {
        var dto = await FetchCatalogAsync(ct);
        if (dto == null)
            return new CollegeInfoActionResult(false, "Не удалось загрузить данные с внешнего сервиса");

        _cache.Set(CatalogCacheKey, dto, CatalogCacheTtl);
        return new CollegeInfoActionResult(true);
    }

    private async Task<CollegeCatalogDto?> FetchCatalogAsync(CancellationToken ct)
    {
        try
        {
            var catalog = await _scheduleApi.GetCatalogAsync(ct);
            if (catalog == null)
                return null;

            return new CollegeCatalogDto(catalog.Groups, catalog.Teachers, catalog.Audiences);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fetch catalog");
            return null;
        }
    }

    public async Task<CollegeScheduleSearchDto?> SearchScheduleAsync(string type, string query, DateTime? date, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
            return null;

        var trimmed = query.Trim();
        CollegePortal.Infrastructure.ExternalApis.Schedule.ScheduleResponseDto? raw = type switch
        {
            "group" => await _scheduleApi.GetGroupScheduleAsync(trimmed, date, ct),
            "teacher" => await _scheduleApi.GetTeacherScheduleAsync(trimmed, date, ct),
            "audience" => await _scheduleApi.GetAudienceScheduleAsync(trimmed, date, ct),
            _ => null
        };

        if (raw == null)
            return null;

        var lessons = KkepikScheduleParser.Parse(raw.ScheduleLines)
            .Select(l => new CollegeLessonItemDto(
                l.StartTime,
                l.EndTime,
                l.Name,
                FormatTeacher(l.Teacher),
                l.Classroom?.Name
            ))
            .ToArray();

        return new CollegeScheduleSearchDto(type, trimmed, raw.Date, lessons);
    }

    public async Task<CollegeTeacherDto[]> GetTeachersAsync(CancellationToken ct = default)
    {
        var rows = await _dbContext.CollegeTeachers.AsNoTracking().OrderBy(t => t.FullName).ToListAsync(ct);
        if (rows.Count == 0)
        {
            await RefreshTeachersCoreAsync(adminUserId: null, ct);
            rows = await _dbContext.CollegeTeachers.AsNoTracking().OrderBy(t => t.FullName).ToListAsync(ct);
        }

        var disciplinesByName = await BuildTeacherDisciplinesAsync(ct);

        return rows.Select(t =>
        {
            var key = SurnameKey(t.FullName);
            var teacherDisciplines = Array.Empty<string>();
            if (key != null && disciplinesByName.TryGetValue(key, out var byName) && byName.Count > 0)
            {
                teacherDisciplines = byName.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
            }

            return new CollegeTeacherDto(
                t.Id,
                t.FullName,
                string.IsNullOrWhiteSpace(t.Position) ? null : t.Position,
                t.PageUrl,
                string.IsNullOrWhiteSpace(t.Phone) ? null : t.Phone,
                string.IsNullOrWhiteSpace(t.Email) ? null : t.Email,
                t.PhotoUrl,
                teacherDisciplines,
                t.UpdatedAt
            );
        }).ToArray();
    }

    public async Task<CollegeInfoActionResult> RefreshTeachersAsync(Guid? adminUserId, CancellationToken ct = default)
    {
        try
        {
            var updated = await RefreshTeachersCoreAsync(adminUserId, ct);
            return updated
                ? new CollegeInfoActionResult(true)
                : new CollegeInfoActionResult(false, "Не удалось загрузить список преподавателей");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to refresh college teachers");
            return new CollegeInfoActionResult(false, "Ошибка при обновлении списка преподавателей");
        }
    }

    private async Task<bool> RefreshTeachersCoreAsync(Guid? adminUserId, CancellationToken ct)
    {
        var items = await _staffClient.GetAllStaffAsync(ct);
        if (items.Count == 0)
        {
            _logger.LogWarning("Gosuslugi staff returned no items");
            return false;
        }

        var now = DateTime.UtcNow;
        var existing = await _dbContext.CollegeTeachers.ToListAsync(ct);
        var existingByName = existing.ToDictionary(e => e.FullName, StringComparer.OrdinalIgnoreCase);

        foreach (var item in items)
        {
            if (existingByName.TryGetValue(item.FullName, out var teacher))
            {
                teacher.Position = item.Position;
                teacher.PageUrl = item.PageUrl;
                teacher.Phone = item.Phone;
                teacher.Email = item.Email;
                teacher.PhotoUrl = item.PhotoUrl;
                teacher.UpdatedAt = now;
            }
            else
            {
                _dbContext.CollegeTeachers.Add(new CollegeTeacher
                {
                    Id = Guid.NewGuid(),
                    FullName = item.FullName,
                    Position = item.Position,
                    PageUrl = item.PageUrl,
                    Phone = item.Phone,
                    Email = item.Email,
                    PhotoUrl = item.PhotoUrl,
                    UpdatedAt = now
                });
            }
        }

        await _dbContext.SaveChangesAsync(ct);

        if (adminUserId.HasValue && adminUserId.Value != Guid.Empty)
        {
            _dbContext.AdminAuditLogs.Add(new AdminAuditLog
            {
                Id = Guid.NewGuid(),
                AdminUserId = adminUserId.Value,
                Action = "Обновить преподавателей (колледж)",
                Details = $"Загружено преподавателей: {items.Count}",
                CreatedAt = DateTime.UtcNow
            });
            await _dbContext.SaveChangesAsync(ct);
        }

        return true;
    }

    private async Task<Dictionary<string, HashSet<string>>> BuildTeacherDisciplinesAsync(CancellationToken ct)
    {
        var snapshots = await _dbContext.KkepikSchedules.AsNoTracking().ToListAsync(ct);
        var result = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var snapshot in snapshots)
        {
            string[] lines;
            try
            {
                lines = JsonSerializer.Deserialize<string[]>(snapshot.ScheduleLinesJson) ?? Array.Empty<string>();
            }
            catch
            {
                continue;
            }

            foreach (var lesson in KkepikScheduleParser.Parse(lines))
            {
                var teacher = lesson.Teacher;
                if (teacher == null || string.IsNullOrWhiteSpace(teacher.LastName))
                    continue;

                var key = teacher.LastName.ToLowerInvariant();
                if (!result.TryGetValue(key, out var set))
                {
                    set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    result[key] = set;
                }

                if (!string.IsNullOrWhiteSpace(lesson.Name))
                    set.Add(lesson.Name.Trim());
            }
        }

        return result;
    }

    private static string? SurnameKey(string fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName))
            return null;

        var firstToken = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return string.IsNullOrEmpty(firstToken) ? null : firstToken.ToLowerInvariant();
    }

    private static string? FormatTeacher(TeacherDto? teacher)
    {
        if (teacher == null)
            return null;

        var name = $"{teacher.LastName} {teacher.FirstName} {teacher.MiddleName}".Trim();
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }
}