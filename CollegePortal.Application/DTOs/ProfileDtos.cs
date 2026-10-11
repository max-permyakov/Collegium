namespace CollegePortal.Application.DTOs;

public record ProfileDto(
    Guid Id,
    string Login,
    string DisplayName,
    string? Email,
    string? PhoneNumber,
    Guid? StudyGroupId,
    string? StudyGroupName,
    int? Course,
    string Role,
    bool IsActive,
    bool IsProtected,
    string HeadmanRole,
    string? Bio,
    string? AvatarDataUrl,
    decimal? AverageMark,
    DateTime? GradesCachedAt,
    DateTime? LastLoginAt,
    DateTime CreatedAt,
    bool IsViewerAdmin
);

public record ProfileUpdateResult(
    bool Success,
    string? Error = null
);

public record UpdateProfileRequestDto(
    string? Bio,
    string? Email,
    string? PhoneNumber
);

public record SetAvatarRequestDto(
    string? DataUrl
);