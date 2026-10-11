namespace CollegePortal.Domain.Entities;

public class Discipline
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Auditorium> Auditoriums { get; set; } = new List<Auditorium>();
}
