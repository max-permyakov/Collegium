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

    /// <summary>Contact handle the user opted to share on their profile (Telegram @username).</summary>
    public string? TelegramUserName { get; set; }

    /// <summary>Short public referral code; generated on first use.</summary>
    public string? ReferralCode { get; set; }

    /// <summary>Inviter this account was attributed to, if any.</summary>
    public Guid? ReferredByUserId { get; set; }

    public DateTime? ReferredAt { get; set; }

    /// <summary>Internal loyalty currency earned for invited users.</summary>
    public int KepkaCoins { get; set; }

    /// <summary>Selected nickname color token from the reward palette.</summary>
    public string? NicknameColor { get; set; }

    /// <summary>Selected avatar frame color; null means the default gold frame.</summary>
    public string? AvatarFrameColor { get; set; }

    /// <summary>Whether the purchased avatar frame is shown at all.</summary>
    public bool ShowAvatarFrame { get; set; } = true;

    /// <summary>Whether reward badges (ambassador, gold) are shown next to the name.</summary>
    public bool ShowBadges { get; set; } = true;

    public StudentProfile? StudentProfile { get; set; }
    public ICollection<UserAuthProvider> AuthProviders { get; set; } = new List<UserAuthProvider>();
}