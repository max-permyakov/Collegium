using System.Text.Json.Serialization;
using CollegePortal.Domain.Enums;

namespace CollegePortal.Application.DTOs;

public record LoginRequestDto(
    string Email,
    string Password
);

// Password required to promote the current account to the primary (protected)
// administrator. Checked against PrimaryAdmin:Secret / PrimaryAdmin:SecretHash.
public record ClaimPrimaryAdminRequestDto(
    string Password
);

// AccessToken/RefreshToken/ExpiresAt are transport details delivered to the
// client as HttpOnly cookies, so they are never serialized into the JSON
// response body.
public record LoginResponseDto(
    [property: JsonIgnore] string AccessToken,
    [property: JsonIgnore] string RefreshToken,
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
    StudentProfileDto? StudentProfile,
    AuthMethod RegistrationSource,
    AuthMethod? LastAuthMethod,
    AuthMethod[] AuthProviders,
    bool HasDiaryLink,
    bool RequiresProfileSetup,
    bool EmailConfirmed
);

public record StudentProfileDto(
    Guid Id,
    Guid StudyGroupId,
    string StudyGroupName,
    int? ExternalStudentId,
    string? Bio,
    string? AvatarDataUrl,
    string HeadmanRole,
    decimal? AverageMark,
    DateTime? GradesCachedAt
);