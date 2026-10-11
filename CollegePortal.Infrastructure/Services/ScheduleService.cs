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

    public async Task<ScheduleResponseDto?> GetScheduleForDayAsync(Guid userId, DateTime date, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null)
        {
            _logger.LogWarning("Student profile not found for user {UserId}", userId);
            return null;
        }

        var daySchedule = await _scheduleProvider.GetScheduleForDayAsync(studentProfile.ExternalStudentId, date, ct);
        if (daySchedule == null)
            return null;

        return MapToResponseDto(daySchedule);
    }

    public async Task<WeekScheduleResponseDto?> GetScheduleForWeekAsync(Guid userId, DateTime startDate, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null)
        {
            _logger.LogWarning("Student profile not found for user {UserId}", userId);
            return null;
        }

        var endDate = startDate.AddDays(6);
        var schedule = await _scheduleProvider.GetScheduleAsync(studentProfile.ExternalStudentId, startDate, endDate, ct);

        return new WeekScheduleResponseDto(
            startDate,
            endDate,
            schedule.Select(MapToResponseDto).ToArray()
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
            .Where(sp => sp.StudyGroupId == studyGroup.Id)
            .ToListAsync(ct);

        if (students.Count == 0)
        {
            _logger.LogWarning("No students found in group {GroupName}", groupName);
            return null;
        }

        var firstStudent = students.First();
        var endDate = startDate.AddDays(6);
        var schedule = await _scheduleProvider.GetScheduleAsync(firstStudent.ExternalStudentId, startDate, endDate, ct);

        return new WeekScheduleResponseDto(
            startDate,
            endDate,
            schedule.Select(MapToResponseDto).ToArray()
        );
    }

    private static ScheduleResponseDto MapToResponseDto(ScheduleDayDto day)
    {
        return new ScheduleResponseDto(day.Date, day.IsHoliday, day.IsShort, day.Lessons);
    }
}