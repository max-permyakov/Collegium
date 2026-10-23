namespace CollegePortal.Domain.Entities;

public class StudentProfile
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid StudyGroupId { get; set; }
    public int? ExternalStudentId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public DateTime? LastGroupChangedAt { get; set; }

    // Public profile fields
    public string? Bio { get; set; }
    public string? AvatarDataUrl { get; set; }
    public HeadmanRole HeadmanRole { get; set; } = HeadmanRole.None;

    // Grades cache (updated on grades fetch / admin recompute)
    public decimal? AverageMark { get; set; }
    public DateTime? GradesCachedAt { get; set; }

    // Group rating: the student opted in to appear in the group ranking
    public bool RatingOptIn { get; set; }

    // Diary integration fields
    public string? DiaryLogin { get; set; }
    public string? DiaryCookieData { get; set; }
    public string? DiaryPasswordHash { get; set; }
    public DateTime? DiaryCookiesExpiresAt { get; set; }
    public DateTime? DiaryLastSyncedAt { get; set; }
    public DateTime? DiaryLinkedAt { get; set; }

    public ApplicationUser User { get; set; } = null!;
    public StudyGroup StudyGroup { get; set; } = null!;
}