namespace CollegePortal.Domain.Entities;

/// <summary>
/// One successful invite: <see cref="InviteeUserId"/> joined through the
/// inviter's referral link and the inviter was credited
/// <see cref="CoinsAwarded"/> KepkaCoins. A user can be an invitee only once,
/// which is enforced by a unique index on <see cref="InviteeUserId"/>.
/// </summary>
public class Referral
{
    public Guid Id { get; set; }

    public Guid InviterUserId { get; set; }

    public Guid InviteeUserId { get; set; }

    public int CoinsAwarded { get; set; } = 1;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ApplicationUser Inviter { get; set; } = null!;

    public ApplicationUser Invitee { get; set; } = null!;
}
