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

    public ApplicationUser Author { get; set; } = null!;
}