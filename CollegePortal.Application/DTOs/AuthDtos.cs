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
    bool IsProtected,
    string? PhoneNumber,
    StudentProfileDto? StudentProfile
);

public record StudentProfileDto(
    Guid Id,
    Guid StudyGroupId,
    string StudyGroupName,
    int ExternalStudentId,
    string? Bio,
    string? AvatarDataUrl,
    string HeadmanRole,
    decimal? AverageMark,
    DateTime? GradesCachedAt
);

public record RefreshTokenRequestDto(
    string RefreshToken
);