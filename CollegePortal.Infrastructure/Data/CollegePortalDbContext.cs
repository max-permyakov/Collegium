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
    public DbSet<Assignment> Assignments => Set<Assignment>();
    public DbSet<KkepikSchedule> KkepikSchedules => Set<KkepikSchedule>();
    public DbSet<AdminAuditLog> AdminAuditLogs => Set<AdminAuditLog>();
    public DbSet<Club> Clubs => Set<Club>();
    public DbSet<ClubMember> ClubMembers => Set<ClubMember>();
    public DbSet<ClubMessage> ClubMessages => Set<ClubMessage>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(e => e.DisplayName).HasMaxLength(200);
            entity.Property(e => e.Role).HasMaxLength(50);
        });

        builder.Entity<StudentProfile>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.HasIndex(e => e.ExternalStudentId).IsUnique();
            entity.Property(e => e.Bio).HasMaxLength(2000);
            entity.Property(e => e.AvatarDataUrl).HasMaxLength(3_000_000);
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
            entity.Property(e => e.Description).HasMaxLength(2000);
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
    }
}