namespace CollegePortal.Domain.Entities;

public class NewsComment
{
    public Guid Id { get; set; }
    public Guid AnnouncementId { get; set; }
    public Guid UserId { get; set; }
    public string Text { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Announcement Announcement { get; set; } = null!;
    public ApplicationUser User { get; set; } = null!;
}
