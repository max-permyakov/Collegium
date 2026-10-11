namespace CollegePortal.Domain.Entities;

public class ClubMessage
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid UserId { get; set; }
    public string Text { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Club Club { get; set; } = null!;
    public ApplicationUser User { get; set; } = null!;
}
