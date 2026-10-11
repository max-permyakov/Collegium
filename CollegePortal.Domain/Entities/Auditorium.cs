namespace CollegePortal.Domain.Entities;

public class Auditorium
{
    public Guid Id { get; set; }
    public Guid BuildingId { get; set; }
    public string Number { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public int? Floor { get; set; }
    public string? LocationHint { get; set; }
    public bool HasComputers { get; set; }

    // Position of the room rectangle on the shared map (map coordinate space).
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public Building Building { get; set; } = null!;
    public ICollection<Discipline> Disciplines { get; set; } = new List<Discipline>();
    public ICollection<CollegeTeacher> Teachers { get; set; } = new List<CollegeTeacher>();
}
