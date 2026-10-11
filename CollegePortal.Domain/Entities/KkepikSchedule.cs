namespace CollegePortal.Domain.Entities;

public class KkepikSchedule
{
    public Guid Id { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public string ScheduleLinesJson { get; set; } = "[]";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}