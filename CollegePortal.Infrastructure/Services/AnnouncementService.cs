using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class AnnouncementService : IAnnouncementService
{
    private readonly CollegePortalDbContext _dbContext;
    private readonly INotificationService _notifications;
    private readonly ILogger<AnnouncementService> _logger;

    public AnnouncementService(
        CollegePortalDbContext dbContext,
        INotificationService notifications,
        ILogger<AnnouncementService> logger)
    {
        _dbContext = dbContext;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task<AnnouncementListDto[]> GetPublishedAsync(Guid? studyGroupId = null, CancellationToken ct = default)
    {
        IQueryable<Announcement> query = _dbContext.Announcements
            .AsNoTracking()
            .Where(a => a.IsPublished && a.PublishedAt <= DateTime.UtcNow)
            .Include(a => a.Author)
            .Include(a => a.StudyGroup);

        if (studyGroupId.HasValue)
        {
            query = query.Where(a => a.StudyGroupId == null || a.StudyGroupId == studyGroupId.Value);
        }

        return await query
            .OrderByDescending(a => a.PublishedAt)
            .Select(a => new AnnouncementListDto(
                a.Id,
                a.Title,
                a.Body,
                a.PublishedAt,
                a.AuthorId,
                a.Author.DisplayName,
                a.Author.StudentProfile != null ? a.Author.StudentProfile.AvatarDataUrl : null,
                a.IsPublished,
                a.CreatedAt,
                a.StudyGroupId,
                a.StudyGroup != null ? a.StudyGroup.Name : null
            ))
            .ToArrayAsync(ct);
    }

    public async Task<AnnouncementDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var announcement = await _dbContext.Announcements
            .AsNoTracking()
            .Include(a => a.Author)
            .Include(a => a.StudyGroup)
            .FirstOrDefaultAsync(a => a.Id == id, ct);

        if (announcement == null)
            return null;

        return new AnnouncementDto(
            announcement.Id,
            announcement.Title,
            announcement.Body,
            announcement.PublishedAt,
            announcement.AuthorId,
            announcement.Author.DisplayName,
            announcement.IsPublished,
            announcement.CreatedAt,
            announcement.UpdatedAt,
            announcement.StudyGroupId,
            announcement.StudyGroup?.Name
        );
    }

    public async Task<AnnouncementDto> CreateAsync(Guid authorId, CreateAnnouncementDto dto, CancellationToken ct = default)
    {
        var announcement = new Announcement
        {
            Id = Guid.NewGuid(),
            Title = dto.Title,
            Body = dto.Body,
            PublishedAt = dto.PublishedAt,
            AuthorId = authorId,
            IsPublished = dto.IsPublished,
            StudyGroupId = dto.StudyGroupId,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Announcements.Add(announcement);
        await _dbContext.SaveChangesAsync(ct);

        if (IsVisible(announcement))
            await NotifyPublishedAsync(announcement, ct);

        var author = await _dbContext.Users.FindAsync(authorId, ct);
        var studyGroup = dto.StudyGroupId.HasValue 
            ? await _dbContext.StudyGroups.FindAsync(dto.StudyGroupId.Value, ct)
            : null;

        return new AnnouncementDto(
            announcement.Id,
            announcement.Title,
            announcement.Body,
            announcement.PublishedAt,
            announcement.AuthorId,
            author?.DisplayName ?? "",
            announcement.IsPublished,
            announcement.CreatedAt,
            announcement.UpdatedAt,
            announcement.StudyGroupId,
            studyGroup?.Name
        );
    }

    public async Task<AnnouncementDto?> UpdateAsync(Guid id, Guid authorId, UpdateAnnouncementDto dto, CancellationToken ct = default)
    {
        var announcement = await _dbContext.Announcements
            .Include(a => a.Author)
            .Include(a => a.StudyGroup)
            .FirstOrDefaultAsync(a => a.Id == id, ct);

        if (announcement == null)
            return null;

        if (announcement.AuthorId != authorId)
        {
            var canModerate = await CanModerateAsync(authorId, ct);
            if (!canModerate)
                return null;
        }

        var wasVisible = IsVisible(announcement);

        announcement.Title = dto.Title;
        announcement.Body = dto.Body;
        announcement.PublishedAt = dto.PublishedAt;
        announcement.IsPublished = dto.IsPublished;
        announcement.StudyGroupId = dto.StudyGroupId;
        announcement.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);

        if (!wasVisible && IsVisible(announcement))
            await NotifyPublishedAsync(announcement, ct);

        return new AnnouncementDto(
            announcement.Id,
            announcement.Title,
            announcement.Body,
            announcement.PublishedAt,
            announcement.AuthorId,
            announcement.Author.DisplayName,
            announcement.IsPublished,
            announcement.CreatedAt,
            announcement.UpdatedAt,
            announcement.StudyGroupId,
            announcement.StudyGroup?.Name
        );
    }

    public async Task<bool> DeleteAsync(Guid id, Guid authorId, CancellationToken ct = default)
    {
        var announcement = await _dbContext.Announcements.FindAsync(id, ct);
        if (announcement == null)
            return false;

        if (announcement.AuthorId != authorId)
        {
            var canModerate = await CanModerateAsync(authorId, ct);
            if (!canModerate)
                return false;
        }

        _dbContext.Announcements.Remove(announcement);
        await _dbContext.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> TogglePublishedAsync(Guid id, Guid authorId, CancellationToken ct = default)
    {
        var announcement = await _dbContext.Announcements.FindAsync(id, ct);
        if (announcement == null)
            return false;

        if (announcement.AuthorId != authorId)
        {
            var canModerate = await CanModerateAsync(authorId, ct);
            if (!canModerate)
                return false;
        }

        var wasVisible = IsVisible(announcement);

        announcement.IsPublished = !announcement.IsPublished;
        announcement.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        if (!wasVisible && IsVisible(announcement))
            await NotifyPublishedAsync(announcement, ct);

        return true;
    }

    /// <summary>
    /// Delivers notifications for scheduled news whose <c>PublishedAt</c> has
    /// matured but which have never been announced. Called by
    /// <see cref="Notifications.AnnouncementPublicationWorker"/> every minute.
    /// </summary>
    public async Task<int> NotifyDueAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var dueIds = await _dbContext.Announcements
            .AsNoTracking()
            .Where(a => a.IsPublished && a.PublishedAt <= now && a.NotifiedAtUtc == null)
            .OrderBy(a => a.PublishedAt)
            .Take(50)
            .Select(a => a.Id)
            .ToArrayAsync(ct);

        var delivered = 0;
        foreach (var id in dueIds)
        {
            // Reload with tracking; another path (manual publish) may have
            // delivered the notification between the query and this reload.
            var announcement = await _dbContext.Announcements.FindAsync(new object[] { id }, ct);
            if (announcement == null || announcement.NotifiedAtUtc != null)
                continue;

            await NotifyPublishedAsync(announcement, ct);
            delivered++;
        }

        return delivered;
    }

    private static bool IsVisible(Announcement announcement) =>
        announcement.IsPublished && announcement.PublishedAt <= DateTime.UtcNow;

    private async Task NotifyPublishedAsync(Announcement announcement, CancellationToken ct)
    {
        // Every announcement is announced at most once. The manual publish
        // paths and the delayed-publication worker both go through here, and
        // NotifiedAtUtc guarantees the job cannot duplicate an already
        // delivered notification (also suppressing re-publish spam).
        if (announcement.NotifiedAtUtc != null)
            return;

        var message = new NotificationMessage(
            NotificationType.News,
            "Новая новость",
            announcement.Title,
            "/news");

        if (announcement.StudyGroupId.HasValue)
        {
            await _notifications.NotifyStudyGroupAsync(
                announcement.StudyGroupId.Value,
                message,
                announcement.AuthorId,
                ct);
        }
        else
        {
            await _notifications.NotifyAllActiveAsync(
                message,
                excludeUserId: announcement.AuthorId,
                ct: ct);
        }

        // Marked after the fan-out so a delivery failure can be retried by the
        // worker on the next sweep.
        announcement.NotifiedAtUtc = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
    }

    // Moderation (editing/deleting someone else's news) is allowed for full
    // admins and for users granted the NewsManage permission.
    private async Task<bool> CanModerateAsync(Guid userId, CancellationToken ct)
    {
        var user = await _dbContext.Users.FindAsync(userId, ct);
        if (user == null)
            return false;

        var isAdmin = await _dbContext.UserRoles.AnyAsync(
            ur => ur.UserId == userId && ur.RoleId == _dbContext.Roles
                .Where(r => r.Name == "Admin")
                .Select(r => r.Id)
                .FirstOrDefault(), ct);
        if (isAdmin)
            return true;

        return await _dbContext.UserPermissions.AnyAsync(
            up => up.UserId == userId && up.Permission == Domain.Enums.Permission.NewsManage, ct);
    }
}