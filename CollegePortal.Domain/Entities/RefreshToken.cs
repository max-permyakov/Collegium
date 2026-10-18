namespace CollegePortal.Domain.Entities;

// Opaque single-session credential delivered to the client as an HttpOnly
// cookie. Only the SHA-256 hash is stored server-side, so a database leak
// cannot be replayed as a login. Rotated (revoke + reissue) on every refresh
// to form a sliding session; revoked on logout, ban and role change.
public class RefreshToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }

    public bool IsActive => RevokedAt == null && DateTime.UtcNow < ExpiresAt;
}
