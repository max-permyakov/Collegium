using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IScheduleProvider
{
    Task<ScheduleDayDto[]> GetScheduleAsync(int studentId, DateTime startDate, DateTime endDate, CancellationToken ct = default);
    Task<ScheduleDayDto?> GetScheduleForDayAsync(int studentId, DateTime date, CancellationToken ct = default);
}

public interface IGradesProvider
{
    Task<SubjectGradeDto[]> GetDashboardAsync(int studentId, CancellationToken ct = default);
    Task<PerformanceDto?> GetPerformanceAsync(int studentId, CancellationToken ct = default);
}

public interface IDiaryApiClient : IScheduleProvider, IGradesProvider
{
    // Legacy method - kept for compatibility
    Task<DiaryLoginResult?> LoginAsync(string login, string password, CancellationToken ct = default);
    
    // New methods for hash-based authentication
    Task<DiaryLoginResult?> LoginWithPrecomputedHashAsync(string login, string passwordHash, CancellationToken ct = default);
    Task<bool> ReloginAsync(string login, string passwordHash, CancellationToken ct = default);
    
    Task<AccountSettingsDto?> GetAccountSettingsAsync(CancellationToken ct = default);
}