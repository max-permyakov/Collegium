namespace CollegePortal.Application.DTOs;

/// <summary>One point of the admin "invites per day" chart.</summary>
public record AdminReferralDailyPointDto(string Date, int Count);

public record AdminTopInviterDto(
    Guid UserId,
    string DisplayName,
    string? GroupName,
    string? ReferralCode,
    int InvitedCount,
    int CoinsEarned,
    DateTime? LastInviteAt
);

public record AdminShopStatDto(
    string Code,
    string Title,
    int Price,
    int PurchasedCount,
    int CoinsSpent
);

public record AdminRecentInviteDto(
    Guid InviterUserId,
    string InviterName,
    Guid InviteeUserId,
    string InviteeName,
    string? InviteeGroupName,
    int CoinsAwarded,
    DateTime CreatedAt
);

public record AdminRecentPurchaseDto(
    Guid UserId,
    string UserName,
    string ItemCode,
    string ItemTitle,
    int PricePaid,
    DateTime PurchasedAt
);

public record AdminCoinTransactionDto(
    Guid Id,
    Guid UserId,
    string UserName,
    int Amount,
    string Reason,
    DateTime CreatedAt
);

public record AdminReferralDashboardDto(
    int TotalInvites,
    int TotalCoinsEarned,
    int TotalCoinsSpent,
    int TotalGrantedCoins,
    int CoinsInCirculation,
    int ActiveInviters,
    int RewardOwners,
    AdminReferralDailyPointDto[] InvitesPerDay,
    AdminTopInviterDto[] TopInviters,
    AdminShopStatDto[] ShopStats,
    AdminRecentInviteDto[] RecentInvites,
    AdminRecentPurchaseDto[] RecentPurchases,
    AdminCoinTransactionDto[] RecentTransactions
);

public record AdminGrantCoinsRequestDto(
    Guid UserId,
    int Amount,
    string? Reason
);

public record AdminGrantCoinsResultDto(
    bool Success,
    string? Error,
    int KepkaCoins = 0
);
