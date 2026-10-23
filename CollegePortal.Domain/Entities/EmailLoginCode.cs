using CollegePortal.Domain.Enums;

namespace CollegePortal.Domain.Entities;

public class EmailLoginCode
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ConsumedAt { get; set; }

    // Set after a successful code verification. The raw token is returned to the
    // client and only its hash is persisted; it is required to finish a new
    // account registration.
    public string? RegistrationTokenHash { get; set; }
    public DateTime? RegistrationTokenExpiresAt { get; set; }

    // Optional pending external identity (used when an OAuth provider does not
    // return a verified email and the user confirms an email by code instead).
    public AuthMethod? OAuthProvider { get; set; }
    public string? OAuthProviderUserId { get; set; }
    public string? OAuthDisplayName { get; set; }
}
