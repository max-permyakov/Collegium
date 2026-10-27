using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using CollegePortal.Domain.Entities;

namespace CollegePortal.Infrastructure.Data;

public class CollegePortalDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public CollegePortalDbContext(DbContextOptions<CollegePortalDbContext> options)
        : base(options)
    {
    }

    public DbSet<StudentProfile> StudentProfiles => Set<StudentProfile>();
    public DbSet<StudyGroup> StudyGroups => Set<StudyGroup>();
    public DbSet<Announcement> Announcements => Set<Announcement>();
    public DbSet<NewsComment> NewsComments => Set<NewsComment>();
    public DbSet<Assignment> Assignments => Set<Assignment>();
    public DbSet<KkepikSchedule> KkepikSchedules => Set<KkepikSchedule>();
    public DbSet<AdminAuditLog> AdminAuditLogs => Set<AdminAuditLog>();
    public DbSet<Club> Clubs => Set<Club>();
    public DbSet<ClubMember> ClubMembers => Set<ClubMember>();
    public DbSet<ClubMessage> ClubMessages => Set<ClubMessage>();
    public DbSet<CollegeTeacher> CollegeTeachers => Set<CollegeTeacher>();
    public DbSet<Building> Buildings => Set<Building>();
    public DbSet<Auditorium> Auditoriums => Set<Auditorium>();
    public DbSet<Discipline> Disciplines => Set<Discipline>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<UserAuthProvider> UserAuthProviders => Set<UserAuthProvider>();
    public DbSet<EmailLoginCode> EmailLoginCodes => Set<EmailLoginCode>();
    public DbSet<GameScore> GameScores => Set<GameScore>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
    public DbSet<Chat> Chats => Set<Chat>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatUpload> ChatUploads => Set<ChatUpload>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(e => e.DisplayName).HasMaxLength(200);
            entity.Property(e => e.Role).HasMaxLength(50);
            entity.Property(e => e.RegistrationSource).HasConversion<int>();
            entity.Property(e => e.LastAuthMethod).HasConversion<int?>();
        });

        builder.Entity<StudentProfile>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.HasIndex(e => e.ExternalStudentId).IsUnique();
            entity.Property(e => e.Bio).HasMaxLength(200);
            entity.Property(e => e.AvatarDataUrl).HasMaxLength(3_000_000);
            entity.Property(e => e.DiaryLogin).HasMaxLength(200);
            entity.Property(e => e.AverageMark).HasPrecision(5, 2);
            entity.HasOne(e => e.User)
                .WithOne(u => u.StudentProfile)
                .HasForeignKey<StudentProfile>(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.StudyGroup)
                .WithMany(g => g.Students)
                .HasForeignKey(e => e.StudyGroupId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<StudyGroup>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(100);
            entity.Property(e => e.AcademicYear).HasMaxLength(20);
        });

        builder.Entity<KkepikSchedule>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.GroupName).HasMaxLength(100);
            entity.Property(e => e.ScheduleLinesJson).HasMaxLength(10000);
            entity.HasIndex(e => new { e.GroupName, e.Date }).IsUnique();
        });

        builder.Entity<Announcement>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).HasMaxLength(500);
            entity.Property(e => e.Body).HasMaxLength(5000);
            entity.HasOne(e => e.Author)
                .WithMany()
                .HasForeignKey(e => e.AuthorId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<NewsComment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Text).HasMaxLength(2000);
            entity.HasIndex(e => new { e.AnnouncementId, e.CreatedAt });
            entity.HasOne(e => e.Announcement)
                .WithMany()
                .HasForeignKey(e => e.AnnouncementId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Assignment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).HasMaxLength(500);
            entity.Property(e => e.Description).HasMaxLength(5000);
            entity.HasOne(e => e.StudyGroup)
                .WithMany(g => g.Assignments)
                .HasForeignKey(e => e.StudyGroupId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.CreatedBy)
                .WithMany()
                .HasForeignKey(e => e.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<AdminAuditLog>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Action).HasMaxLength(100);
            entity.Property(e => e.Details).HasMaxLength(2000);
            entity.HasIndex(e => e.CreatedAt);
            entity.HasOne(e => e.AdminUser)
                .WithMany()
                .HasForeignKey(e => e.AdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Club>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(120);
            entity.Property(e => e.Description).HasMaxLength(200);
            entity.Property(e => e.AvatarDataUrl).HasMaxLength(3_000_000);
            entity.Property(e => e.InviteToken).HasMaxLength(64);
            entity.HasIndex(e => e.InviteToken).IsUnique();
            entity.HasOne(e => e.Owner)
                .WithMany()
                .HasForeignKey(e => e.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ClubMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.ClubId, e.UserId }).IsUnique();
            entity.HasOne(e => e.Club)
                .WithMany(c => c.Members)
                .HasForeignKey(e => e.ClubId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ClubMessage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Text).HasMaxLength(2000);
            entity.HasIndex(e => new { e.ClubId, e.CreatedAt });
            entity.HasOne(e => e.Club)
                .WithMany(c => c.Messages)
                .HasForeignKey(e => e.ClubId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    builder.Entity<CollegeTeacher>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.FullName).IsUnique();
            entity.Property(e => e.FullName).HasMaxLength(200);
            entity.Property(e => e.Position).HasMaxLength(500);
            entity.Property(e => e.PageUrl).HasMaxLength(1000);
            entity.Property(e => e.Phone).HasMaxLength(100);
            entity.Property(e => e.Email).HasMaxLength(200);
            entity.Property(e => e.PhotoUrl).HasMaxLength(1000);
        });

        builder.Entity<Building>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Name).IsUnique();
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.Description).HasMaxLength(2000);
        });

        builder.Entity<Discipline>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.HasIndex(e => e.Name).IsUnique();
        });

        builder.Entity<RefreshToken>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TokenHash).HasMaxLength(64);
            entity.HasIndex(e => e.TokenHash).IsUnique();
            entity.HasIndex(e => e.UserId);
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<UserPermission>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.UserId, e.Permission }).IsUnique();
            entity.Property(e => e.Permission).HasConversion<int>();
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<UserAuthProvider>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Provider).HasConversion<int>();
            entity.Property(e => e.ProviderUserId).HasMaxLength(200);
            entity.Property(e => e.ProviderEmail).HasMaxLength(320);
            entity.HasIndex(e => new { e.Provider, e.ProviderUserId }).IsUnique();
            entity.HasIndex(e => new { e.UserId, e.Provider }).IsUnique();
            entity.HasOne(e => e.User)
                .WithMany(u => u.AuthProviders)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<EmailLoginCode>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Email).HasMaxLength(320);
            entity.Property(e => e.CodeHash).HasMaxLength(64);
            entity.Property(e => e.RegistrationTokenHash).HasMaxLength(64);
            entity.Property(e => e.OAuthProvider).HasConversion<int?>();
            entity.Property(e => e.OAuthProviderUserId).HasMaxLength(200);
            entity.Property(e => e.OAuthDisplayName).HasMaxLength(200);
            entity.HasIndex(e => new { e.Email, e.CreatedAt });
            entity.HasIndex(e => e.RegistrationTokenHash);
        });

        builder.Entity<GameScore>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.GameId, e.Mode, e.UserId }).IsUnique();
            entity.Property(e => e.GameId).HasMaxLength(50);
            entity.Property(e => e.Mode).HasMaxLength(50);
            entity.HasIndex(e => new { e.GameId, e.Mode, e.Score });
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Auditorium>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.BuildingId, e.Number }).IsUnique();
            entity.Property(e => e.Number).HasMaxLength(50);
            entity.Property(e => e.DisplayName).HasMaxLength(200);
            entity.Property(e => e.LocationHint).HasMaxLength(500);
            entity.HasOne(e => e.Building)
                .WithMany(b => b.Auditoriums)
                .HasForeignKey(e => e.BuildingId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(e => e.Disciplines)
                .WithMany(d => d.Auditoriums)
                .UsingEntity(join => join.ToTable("AuditoriumDisciplines"));
            entity.HasMany(e => e.Teachers)
                .WithMany()
                .UsingEntity(join => join.ToTable("AuditoriumTeachers"));
        });
        builder.Entity<PushSubscription>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Endpoint).HasMaxLength(2048);
            entity.Property(x => x.P256DH).HasMaxLength(512);
            entity.Property(x => x.Auth).HasMaxLength(128);
            entity.Property(x => x.UserAgent).HasMaxLength(300);
            entity.HasIndex(x => x.Endpoint).IsUnique();
            entity.HasIndex(x => x.UserId);
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Notification>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).HasConversion<int>();
            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.Body).HasMaxLength(1000);
            entity.Property(e => e.Url).HasMaxLength(500);
            entity.HasIndex(e => new { e.UserId, e.IsRead, e.CreatedAt });
            entity.HasIndex(e => new { e.PushSentAt, e.CreatedAt });
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<NotificationPreference>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).HasConversion<int>();
            // Only one row per (user, type) — an upsert target for preferences.
            entity.HasIndex(e => new { e.UserId, e.Type }).IsUnique();
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // NotifiedAtUtc powers the delayed-news publication worker.
        builder.Entity<Announcement>(entity =>
        {
            entity.HasIndex(e => new { e.IsPublished, e.PublishedAt });
            entity.HasIndex(e => new { e.NotifiedAtUtc, e.PublishedAt });
        });

        builder.Entity<Chat>(entity =>
        {
            entity.HasKey(e => e.Id);
            // A normalized ordered pair: the same two users always share one row.
            entity.HasIndex(e => new { e.User1Id, e.User2Id }).IsUnique();
            entity.HasOne(e => e.User1)
                .WithMany()
                .HasForeignKey(e => e.User1Id)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.User2)
                .WithMany()
                .HasForeignKey(e => e.User2Id)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ChatMessage>(entity =>
        {
            // bigint identity — monotonic order/pagination key used by the client.
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedOnAdd();
            entity.Property(e => e.Text).HasMaxLength(4000);
            entity.Property(e => e.FileName).HasMaxLength(200);
            entity.Property(e => e.ContentType).HasMaxLength(120);
            entity.Property(e => e.StorageKey).HasMaxLength(300);
            entity.Property(e => e.Kind).HasConversion<int>();
            entity.HasIndex(e => new { e.ChatId, e.Id });
            entity.HasOne(e => e.Chat)
                .WithMany(c => c.Messages)
                .HasForeignKey(e => e.ChatId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Sender)
                .WithMany()
                .HasForeignKey(e => e.SenderId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<ChatUpload>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Kind).HasConversion<int>();
            entity.Property(e => e.FileName).HasMaxLength(200);
            entity.Property(e => e.ContentType).HasMaxLength(120);
            entity.Property(e => e.StorageKey).HasMaxLength(300);
            entity.HasIndex(e => e.CreatedAt);
            entity.HasOne(e => e.Chat)
                .WithMany()
                .HasForeignKey(e => e.ChatId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Uploader)
                .WithMany()
                .HasForeignKey(e => e.UploaderId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}