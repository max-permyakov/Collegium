namespace CollegePortal.Domain.Entities;

public class StudentProfile
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid StudyGroupId { get; set; }
    public int ExternalStudentId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ApplicationUser User { get; set; } = null!;
    public StudyGroup StudyGroup { get; set; } = null!;
}