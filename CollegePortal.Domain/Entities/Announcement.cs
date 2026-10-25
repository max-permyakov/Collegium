namespace CollegePortal.Domain.Entities;

public class Announcement
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public DateTime PublishedAt { get; set; }
    public Guid AuthorId { get; set; }
    public bool IsPublished { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public Guid? StudyGroupId { get; set; }

    // Set when notifications about the published announcement were created. The
    // delayed-publication worker uses it to deliver scheduled news exactly once.
    public DateTime? NotifiedAtUtc { get; set; }

    public ApplicationUser Author { get; set; } = null!;
    public StudyGroup? StudyGroup { get; set; }
}