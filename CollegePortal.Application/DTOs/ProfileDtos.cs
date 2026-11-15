namespace CollegePortal.Application.DTOs;

public record ProfileDto(
    Guid Id,
    string Login,
    string DisplayName,
    string? Email,
    string? PhoneNumber,
    string? TelegramUserName,
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
    DateTime? LastActivityAt,
    DateTime CreatedAt,
    bool IsViewerAdmin,
    bool HasDiaryLink,
    DateTime? LastGroupChangedAt,
    int KepkaCoins,
    string? NicknameColor,
    string[] RewardCodes
);

public record ProfileUpdateResult(
    bool Success,
    string? Error = null
);

public record UpdateProfileRequestDto(
    string? Bio,
    string? Email,
    string? PhoneNumber,
    string? DisplayName,
    string? TelegramUserName
);

public record SetAvatarRequestDto(
    string? DataUrl
);

// Limited, contact-free view of another user that any authenticated user may see.
public record PublicProfileDto(
    Guid Id,
    string DisplayName,
    string? StudyGroupName,
    string HeadmanRole,
    string? Bio,
    string? AvatarDataUrl,
    PublicClubDto[] Clubs,
    string? NicknameColor,
    string[] RewardCodes
);

public record PublicClubDto(
    Guid Id,
    string Name,
    string? AvatarDataUrl,
    bool IsPrivate
);