using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class ScheduleService : IScheduleService
{
    private readonly IScheduleProvider _scheduleProvider;
    private readonly CollegePortalDbContext _dbContext;
    private readonly ILogger<ScheduleService> _logger;

    public ScheduleService(
        IScheduleProvider scheduleProvider,
        CollegePortalDbContext dbContext,
        ILogger<ScheduleService> logger)
    {
        _scheduleProvider = scheduleProvider;
        _dbContext = dbContext;
        _logger = logger;
    }

    private async Task<StudentProfile?> GetStudentProfileAsync(Guid userId, CancellationToken ct)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null)
        {
            _logger.LogWarning("Student profile not found for user {UserId}", userId);
            return null;
        }

        return studentProfile;
    }

    public async Task<ScheduleResponseDto?> GetScheduleForDayAsync(Guid userId, DateTime date, CancellationToken ct = default)
    {
        var studentProfile = await GetStudentProfileAsync(userId, ct);
        if (studentProfile == null)
            return null;

        if (studentProfile.ExternalStudentId == null)
            return null;

        var daySchedule = await _scheduleProvider.GetScheduleForDayAsync(studentProfile.ExternalStudentId.Value, date, ct);
        if (daySchedule == null)
            return null;

        var snapshots = await LoadKkepikSnapshotsAsync(studentProfile.StudyGroup?.Name, date, date, ct);
        return await BuildDayResponse(daySchedule, snapshots, ct);
    }

    public async Task<WeekScheduleResponseDto?> GetScheduleForWeekAsync(Guid userId, DateTime startDate, CancellationToken ct = default)
    {
        var studentProfile = await GetStudentProfileAsync(userId, ct);
        if (studentProfile == null)
            return null;

        if (studentProfile.ExternalStudentId == null)
            return null;

        var endDate = startDate.AddDays(6);
        var schedule = await _scheduleProvider.GetScheduleAsync(studentProfile.ExternalStudentId.Value, startDate, endDate, ct);
        var snapshots = await LoadKkepikSnapshotsAsync(studentProfile.StudyGroup?.Name, startDate, endDate, ct);

        return new WeekScheduleResponseDto(
            startDate,
            endDate,
            await Task.WhenAll(schedule.Select(day => BuildDayResponse(day, snapshots, ct)))
        );
    }

    public async Task<WeekScheduleResponseDto?> GetGroupScheduleForWeekAsync(string groupName, DateTime startDate, CancellationToken ct = default)
    {
        var studyGroup = await _dbContext.StudyGroups
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Name == groupName, ct);

        if (studyGroup == null)
        {
            _logger.LogWarning("Study group not found: {GroupName}", groupName);
            return null;
        }

        var students = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Where(sp => sp.StudyGroupId == studyGroup.Id && sp.ExternalStudentId != null)
            .ToListAsync(ct);

        if (students.Count == 0)
        {
            _logger.LogWarning("No students with a linked diary found in group {GroupName}", groupName);
            return null;
        }

        var firstStudent = students.First();
        var endDate = startDate.AddDays(6);
        var schedule = await _scheduleProvider.GetScheduleAsync(firstStudent.ExternalStudentId!.Value, startDate, endDate, ct);
        var snapshots = await LoadKkepikSnapshotsAsync(groupName, startDate, endDate, ct);

        return new WeekScheduleResponseDto(
            startDate,
            endDate,
            await Task.WhenAll(schedule.Select(day => BuildDayResponse(day, snapshots, ct)))
        );
    }

    public async Task<KkepikScheduleResponseDto?> GetKkepikScheduleAsync(Guid userId, DateTime? date = null, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null || string.IsNullOrWhiteSpace(studentProfile.StudyGroup?.Name))
        {
            _logger.LogWarning("Student profile or group not found for user {UserId}", userId);
            return null;
        }

        var groupName = studentProfile.StudyGroup.Name;

        var query = _dbContext.KkepikSchedules
            .AsNoTracking()
            .Where(s => s.GroupName == groupName);

        if (date.HasValue)
        {
            query = query.Where(s => s.Date == DateTime.SpecifyKind(date.Value.Date, DateTimeKind.Utc));
        }
        else
        {
            // Moscow calendar date (fixed UTC+3, no DST) expressed as a UTC midnight,
            // so it can be compared with the stored, UTC-backed schedule dates.
            // Only schedules after today are relevant: older snapshots stay in the
            // table and would otherwise be served as "tomorrow's" schedule.
            var today = DateTime.UtcNow.AddHours(3).Date;
            query = query.Where(s => s.Date > today);
        }

        var snapshot = await query
            .OrderBy(s => s.Date)
            .FirstOrDefaultAsync(ct);

        if (snapshot == null)
            return null;

        return await ToKkepikResponseAsync(snapshot, ct);
    }

    private async Task<KkepikScheduleResponseDto> ToKkepikResponseAsync(KkepikSchedule snapshot, CancellationToken ct)
    {
        var lines = await DeserializeLinesAsync(snapshot, ct);

        return new KkepikScheduleResponseDto(
            snapshot.Date,
            snapshot.GroupName,
            lines.Length > 0 ? KkepikScheduleParser.Parse(lines, snapshot.Date.DayOfWeek) : Array.Empty<LessonDto>(),
            snapshot.UpdatedAt
        );
    }

    private async Task<string[]> DeserializeLinesAsync(KkepikSchedule snapshot, CancellationToken ct)
    {
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<string[]>(snapshot.ScheduleLinesJson) ?? Array.Empty<string>();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize kkepik schedule lines for {Group} on {Date}", snapshot.GroupName, snapshot.Date.ToString("yyyy-MM-dd"));
            return Array.Empty<string>();
        }
    }

    // Кеш kkepik (дата -> строки расписания). Используется, чтобы на главной и
    // во вкладке "Расписание" показывалось расписание kkepik (в том числе
    // аудитории) там, где колледж его уже опубликовал, — вместо данных
    // электронного дневника.
    private async Task<Dictionary<DateTime, KkepikSchedule>> LoadKkepikSnapshotsAsync(string? groupName, DateTime startDate, DateTime endDate, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(groupName))
            return new Dictionary<DateTime, KkepikSchedule>();

        var start = DateTime.SpecifyKind(startDate.Date, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(endDate.Date, DateTimeKind.Utc);

        var snapshots = await _dbContext.KkepikSchedules
            .AsNoTracking()
            .Where(s => s.GroupName == groupName && s.Date >= start && s.Date <= end)
            .ToListAsync(ct);

        var result = new Dictionary<DateTime, KkepikSchedule>();
        foreach (var snapshot in snapshots)
        {
            if (!result.TryGetValue(snapshot.Date.Date, out var existing) || snapshot.UpdatedAt > existing.UpdatedAt)
                result[snapshot.Date.Date] = snapshot;
        }
        return result;
    }

    private async Task<ScheduleResponseDto> BuildDayResponse(ScheduleDayDto day, Dictionary<DateTime, KkepikSchedule> snapshots, CancellationToken ct)
    {
        if (snapshots.TryGetValue(day.Date.Date, out var snapshot))
        {
            var lines = await DeserializeLinesAsync(snapshot, ct);
            var lessons = lines.Length > 0 ? KkepikScheduleParser.Parse(lines, day.Date.DayOfWeek) : Array.Empty<LessonDto>();
            if (lessons.Length > 0)
            {
                // kkepik — актуальный источник: опубликованные им пары заменяют
                // данные дневника (включая аудитории).
                return new ScheduleResponseDto(day.Date, false, day.IsShort, lessons, "kkepik");
            }
        }

        return MapToResponseDto(day);
    }

    private static ScheduleResponseDto MapToResponseDto(ScheduleDayDto day)
    {
        return new ScheduleResponseDto(day.Date, day.IsHoliday, day.IsShort, day.Lessons, "diary");
    }
}