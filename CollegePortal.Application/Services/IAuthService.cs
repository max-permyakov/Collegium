using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IAuthService
{
    Task<LoginResponseDto?> LoginAsync(string email, string password, CancellationToken ct = default);
    Task LogoutAsync(Guid userId, CancellationToken ct = default);
    Task<UserDto?> GetCurrentUserAsync(Guid userId, CancellationToken ct = default);
    Task<LoginResponseDto?> RegisterAsync(string email, string password, string displayName, string role, CancellationToken ct = default);
    Task<bool> AssignStudentProfileAsync(Guid userId, int externalStudentId, Guid studyGroupId, CancellationToken ct = default);
}