namespace CollegePortal.Application.DTOs;

public record ReferralInviteDto(
    string DisplayName,
    string? AvatarDataUrl,
    DateTime JoinedAt,
    int CoinsAwarded
);

public record ReferralSummaryDto(
    string ReferralCode,
    int KepkaCoins,
    int TotalInvited,
    ReferralInviteDto[] Invites,
    string[] RewardCodes,
    string? NicknameColor
);

public record ShopItemDto(
    string Code,
    string Title,
    string Description,
    string Icon,
    int Price,
    bool Purchased
);

public record ShopResponseDto(
    int KepkaCoins,
    ShopItemDto[] Items
);

public record PurchaseResultDto(
    bool Success,
    string? Error,
    int KepkaCoins,
    string? ItemCode = null
);

public record ClaimReferralRequestDto(
    string Code
);

public record ClaimReferralResultDto(
    bool Success,
    string? Error,
    int CoinsAwarded = 0,
    bool AlreadyClaimed = false
);

public record ReferralCodeValidationDto(
    bool Valid,
    string? InviterDisplayName = null
);

public record SetNicknameColorRequestDto(
    string? Color
);

public record NicknameColorResultDto(
    bool Success,
    string? Error,
    string? NicknameColor = null
);

public record RewardFileResult(
    string StoragePath,
    string FileName,
    string ContentType
);
