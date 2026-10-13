using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IAuthService
{
    Task<LoginResponseDto?> LoginAsync(string email, string password, CancellationToken ct = default);
    Task LogoutAsync(Guid userId, CancellationToken ct = default);
    Task<UserDto?> GetCurrentUserAsync(Guid userId, CancellationToken ct = default);
    Task<bool> AssignStudentProfileAsync(Guid userId, int externalStudentId, Guid studyGroupId, CancellationToken ct = default);

    // Promotes the given account to the primary (protected) administrator when
    // the supplied secret matches PrimaryAdmin:Secret / PrimaryAdmin:SecretHash.
    Task<LoginResponseDto?> ClaimPrimaryAdminAsync(Guid userId, string secret, CancellationToken ct = default);

    // Diary integration
    Task<LoginResponseDto?> DiaryLoginAsync(string login, string passwordHash, CancellationToken ct = default);
    Task<LoginResponseDto?> DiaryReloginAsync(Guid userId, CancellationToken ct = default);
    Task<bool> UpdateDiaryDataAsync(Guid userId, int externalStudentId, string cookieData, string passwordHash, DateTime? cookiesExpiresAt, CancellationToken ct = default);
}