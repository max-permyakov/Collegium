namespace CollegePortal.Domain.Entities;

public class Club
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? AvatarDataUrl { get; set; }

    // Private clubs are only visible to members (and admins).
    public bool IsPrivate { get; set; }

    // When true, joining requires the invite link/token.
    public bool JoinByLink { get; set; }

    // Pinned clubs are shown at the top of the list.
    public bool IsPinned { get; set; }

    public string InviteToken { get; set; } = string.Empty;

    public Guid OwnerId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ApplicationUser Owner { get; set; } = null!;
    public ICollection<ClubMember> Members { get; set; } = new List<ClubMember>();
    public ICollection<ClubMessage> Messages { get; set; } = new List<ClubMessage>();
}
