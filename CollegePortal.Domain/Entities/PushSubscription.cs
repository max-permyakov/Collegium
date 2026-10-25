namespace CollegePortal.Domain.Entities;

public class PushSubscription
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    public string Endpoint { get; set; } = string.Empty;
    public string P256DH { get; set; } = string.Empty; // публичный ключ браузера
    public string Auth { get; set; } = string.Empty;   // auth-секрет
    public string? UserAgent { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSuccessAt { get; set; }
    public int FailureCount { get; set; }
}