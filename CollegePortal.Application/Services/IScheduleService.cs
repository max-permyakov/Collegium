using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IScheduleService
{
    Task<ScheduleResponseDto?> GetScheduleForDayAsync(Guid userId, DateTime date, CancellationToken ct = default);
    Task<WeekScheduleResponseDto?> GetScheduleForWeekAsync(Guid userId, DateTime startDate, CancellationToken ct = default);
    Task<WeekScheduleResponseDto?> GetGroupScheduleForWeekAsync(string groupName, DateTime startDate, CancellationToken ct = default);
    Task<KkepikScheduleResponseDto?> GetKkepikScheduleAsync(Guid userId, DateTime? date = null, CancellationToken ct = default);
}