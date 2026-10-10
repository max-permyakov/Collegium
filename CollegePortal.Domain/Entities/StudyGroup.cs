namespace CollegePortal.Domain.Entities;

public class StudyGroup
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Course { get; set; }
    public string AcademicYear { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<StudentProfile> Students { get; set; } = new List<StudentProfile>();
    public ICollection<Announcement> Announcements { get; set; } = new List<Announcement>();
    public ICollection<Assignment> Assignments { get; set; } = new List<Assignment>();
}