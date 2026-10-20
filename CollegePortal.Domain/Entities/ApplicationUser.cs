using Microsoft.AspNetCore.Identity;

namespace CollegePortal.Domain.Entities;

public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "Student";
    public bool IsActive { get; set; } = true;
    public bool IsProtected { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
    public DateTime? LastActivityAt { get; set; }

    public StudentProfile? StudentProfile { get; set; }
}