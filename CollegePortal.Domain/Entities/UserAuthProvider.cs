using CollegePortal.Domain.Enums;

namespace CollegePortal.Domain.Entities;

public class UserAuthProvider
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public AuthMethod Provider { get; set; }
    public string ProviderUserId { get; set; } = string.Empty;
    public string? ProviderEmail { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }

    public ApplicationUser User { get; set; } = null!;
}
