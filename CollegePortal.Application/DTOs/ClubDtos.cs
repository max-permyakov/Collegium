namespace CollegePortal.Application.DTOs;

public record ClubListDto(
    Guid Id,
    string Name,
    string? Description,
    string? AvatarDataUrl,
    bool IsPrivate,
    bool JoinByLink,
    Guid OwnerId,
    string OwnerName,
    int MemberCount,
    bool IsMember,
    bool IsLeader,
    DateTime CreatedAt
);

public record ClubMemberDto(
    Guid UserId,
    string DisplayName,
    string? AvatarDataUrl,
    bool IsLeader,
    DateTime JoinedAt
);

public record ClubMessageDto(
    Guid Id,
    Guid ClubId,
    Guid UserId,
    string UserName,
    string? UserAvatar,
    string Text,
    DateTime CreatedAt
);

public record ClubDetailDto(
    Guid Id,
    string Name,
    string? Description,
    string? AvatarDataUrl,
    bool IsPrivate,
    bool JoinByLink,
    string? InviteToken,
    Guid OwnerId,
    string OwnerName,
    int MemberCount,
    bool IsMember,
    bool IsLeader,
    bool CanManage,
    bool CanJoin,
    DateTime CreatedAt,
    ClubMemberDto[] Members
);

public record CreateClubDto(
    string Name,
    string? Description,
    string? AvatarDataUrl,
    bool IsPrivate,
    bool JoinByLink
);

public record UpdateClubDto(
    string Name,
    string? Description,
    string? AvatarDataUrl,
    bool IsPrivate,
    bool JoinByLink
);

public record CreateClubMessageDto(
    string Text
);

public record SetClubLeaderDto(
    bool IsLeader
);

public record JoinClubDto(
    string? Token
);

public record ClubActionResult(
    bool Success,
    string? Error = null
);
