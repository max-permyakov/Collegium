using CollegePortal.Domain.Enums;
using Microsoft.AspNetCore.Identity;

namespace CollegePortal.Domain.Entities;

public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "Student";
    public bool IsActive { get; set; } = true;
    public bool IsProtected { get; set; }
    public AuthMethod RegistrationSource { get; set; } = AuthMethod.Diary;
    public AuthMethod? LastAuthMethod { get; set; }
    public DateTime? LastAuthAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
    public DateTime? LastActivityAt { get; set; }

    public StudentProfile? StudentProfile { get; set; }
    public ICollection<UserAuthProvider> AuthProviders { get; set; } = new List<UserAuthProvider>();
}