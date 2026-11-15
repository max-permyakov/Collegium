namespace CollegePortal.Domain.Entities;

/// <summary>
/// A reward the user owns. The catalog itself is code-defined
/// (<c>ReferralShopCatalog</c>), so only the purchased code and price are
/// persisted. One row per (user, item).
/// </summary>
public class UserPurchase
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    /// <summary>Stable shop item code, e.g. "report-formatter".</summary>
    public string ItemCode { get; set; } = string.Empty;

    /// <summary>Coins actually charged; 0 for gifted rewards.</summary>
    public int PricePaid { get; set; }

    public DateTime PurchasedAt { get; set; } = DateTime.UtcNow;

    public ApplicationUser User { get; set; } = null!;
}
