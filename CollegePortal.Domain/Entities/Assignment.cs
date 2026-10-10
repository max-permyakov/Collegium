namespace CollegePortal.Domain.Entities;

public class Assignment
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime DueAt { get; set; }
    public Guid StudyGroupId { get; set; }
    public Guid CreatedById { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public StudyGroup StudyGroup { get; set; } = null!;
    public ApplicationUser CreatedBy { get; set; } = null!;
}