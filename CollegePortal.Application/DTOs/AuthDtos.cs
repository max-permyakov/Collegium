namespace CollegePortal.Application.DTOs;

public record LoginRequestDto(
    string Email,
    string Password
);

public record LoginResponseDto(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User
);

public record UserDto(
    Guid Id,
    string Email,
    string DisplayName,
    string Role,
    bool IsActive,
    StudentProfileDto? StudentProfile
);

public record StudentProfileDto(
    Guid Id,
    Guid StudyGroupId,
    string StudyGroupName,
    int ExternalStudentId
);

public record RegisterRequestDto(
    string Email,
    string Password,
    string DisplayName,
    string Role
);

public record RefreshTokenRequestDto(
    string RefreshToken
);