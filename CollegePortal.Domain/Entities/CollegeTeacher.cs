namespace CollegePortal.Domain.Entities;

public class CollegeTeacher
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Position { get; set; } = string.Empty;
    public string? PageUrl { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? PhotoUrl { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}