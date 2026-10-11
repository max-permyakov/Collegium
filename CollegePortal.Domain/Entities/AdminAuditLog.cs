namespace CollegePortal.Domain.Entities;

public class AdminAuditLog
{
    public Guid Id { get; set; }
    public Guid AdminUserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public Guid? TargetUserId { get; set; }
    public string Details { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ApplicationUser AdminUser { get; set; } = null!;
}