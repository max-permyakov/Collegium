namespace CollegePortal.Domain.Entities;

public class Building
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<Auditorium> Auditoriums { get; set; } = new List<Auditorium>();
}
