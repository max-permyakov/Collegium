namespace CollegePortal.Domain.Entities;

public class ClubMember
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid UserId { get; set; }
    public bool IsLeader { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    public Club Club { get; set; } = null!;
    public ApplicationUser User { get; set; } = null!;
}
