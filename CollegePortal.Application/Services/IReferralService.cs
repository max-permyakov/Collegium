using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

/// <summary>
/// Referral program and KepkaCoin shop. Codes are generated lazily and are
/// safe to expose; attribution is claimed by the invitee's own account after
/// registration.
/// </summary>
public interface IReferralService
{
    Task<ReferralSummaryDto?> GetSummaryAsync(Guid userId, CancellationToken ct = default);

    Task<ShopResponseDto?> GetShopAsync(Guid userId, CancellationToken ct = default);

    Task<PurchaseResultDto> PurchaseAsync(Guid userId, string itemCode, CancellationToken ct = default);

    Task<ClaimReferralResultDto> ClaimAsync(Guid userId, string code, CancellationToken ct = default);

    Task<ReferralCodeValidationDto> ValidateCodeAsync(string code, CancellationToken ct = default);

    Task<NicknameColorResultDto> SetNicknameColorAsync(
        Guid userId,
        string? color,
        CancellationToken ct = default);

    /// <summary>
    /// Returns the configured protected file for an owned downloadable reward,
    /// or null when the item does not exist or is not owned.
    /// </summary>
    Task<RewardFileResult?> GetRewardFileAsync(
        Guid userId,
        string itemCode,
        CancellationToken ct = default);

    /// <summary>Aggregated referral, shop and coin statistics for the admin panel.</summary>
    Task<AdminReferralDashboardDto> GetAdminDashboardAsync(
        int days = 30,
        CancellationToken ct = default);

    /// <summary>
    /// Credits KepkaCoins to a user on behalf of an administrator. The ledger
    /// row, the audit entry and the user's balance are written together.
    /// </summary>
    Task<AdminGrantCoinsResultDto> GrantCoinsAsync(
        Guid adminUserId,
        Guid userId,
        int amount,
        string? reason,
        CancellationToken ct = default);
}
