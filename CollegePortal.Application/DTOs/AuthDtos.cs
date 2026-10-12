using System.Text.Json.Serialization;

namespace CollegePortal.Application.DTOs;

public record LoginRequestDto(
    string Email,
    string Password
);

// AccessToken/ExpiresAt are transport details delivered to the client as an
// HttpOnly cookie, so they are never serialized into the JSON response body.
public record LoginResponseDto(
    [property: JsonIgnore] string AccessToken,
    [property: JsonIgnore] DateTime ExpiresAt,
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