namespace CollegePortal.Domain.Entities;

/// <summary>
/// Append-only KepkaCoin ledger. <see cref="Amount"/> is signed: positive for
/// accruals (referrals) and negative for shop purchases.
/// </summary>
public class CoinTransaction
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public int Amount { get; set; }

    /// <summary>Human-readable reason shown in the coin history.</summary>
    public string Reason { get; set; } = string.Empty;

    /// <summary>Other user involved (e.g. the invitee), when applicable.</summary>
    public Guid? CounterpartyUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ApplicationUser User { get; set; } = null!;
}
