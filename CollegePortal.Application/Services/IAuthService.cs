using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IAuthService
{
    Task<LoginResponseDto?> LoginAsync(string email, string password, CancellationToken ct = default);
    Task LogoutAsync(Guid userId, CancellationToken ct = default);
    Task<UserDto?> GetCurrentUserAsync(Guid userId, CancellationToken ct = default);
    Task<bool> AssignStudentProfileAsync(Guid userId, int externalStudentId, Guid studyGroupId, CancellationToken ct = default);

    // Diary integration
    Task<LoginResponseDto?> DiaryLoginAsync(string login, string passwordHash, CancellationToken ct = default);
    Task<LoginResponseDto?> DiaryReloginAsync(Guid userId, CancellationToken ct = default);
    Task<bool> UpdateDiaryDataAsync(Guid userId, int externalStudentId, string cookieData, string passwordHash, DateTime? cookiesExpiresAt, CancellationToken ct = default);
}