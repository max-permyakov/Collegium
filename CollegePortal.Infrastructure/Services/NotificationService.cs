using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class NotificationService : INotificationService
{
    private const int TitleMaxLength = 200;
    private const int BodyMaxLength = 1000;

    private readonly CollegePortalDbContext _dbContext;
    private readonly NotificationQueue _queue;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        CollegePortalDbContext dbContext,
        NotificationQueue queue,
        ILogger<NotificationService> logger)
    {
        _dbContext = dbContext;
        _queue = queue;
        _logger = logger;
    }

    public async Task NotifyUsersAsync(
        IReadOnlyCollection<Guid> userIds,
        NotificationMessage message,
        CancellationToken ct = default)
    {
        var recipients = userIds
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToArray();

        if (recipients.Length == 0)
            return;

        var (title, body, url) = Normalize(message);
        var now = DateTime.UtcNow;

        var notifications = recipients
            .Select(userId => new Notification
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Type = message.Type,
                Title = title,
                Body = body,
                Url = url,
                IsRead = false,
                CreatedAt = now
            })
            .ToArray();

        _dbContext.Notifications.AddRange(notifications);
        await _dbContext.SaveChangesAsync(ct);

        foreach (var notification in notifications)
            _queue.Enqueue(notification.Id);

        _logger.LogInformation(
            "Created {Count} notifications of type {Type}",
            notifications.Length,
            message.Type);
    }

    public async Task NotifyStudyGroupAsync(
        Guid studyGroupId,
        NotificationMessage message,
        Guid? excludeUserId = null,
        CancellationToken ct = default)
    {
        var userIds = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Where(sp => sp.StudyGroupId == studyGroupId && sp.User.IsActive)
            .Select(sp => sp.UserId)
            .Where(id => excludeUserId == null || id != excludeUserId.Value)
            .ToArrayAsync(ct);

        await NotifyUsersAsync(userIds, message, ct);
    }

    public async Task NotifyAllActiveAsync(
        NotificationMessage message,
        Guid? studyGroupId = null,
        Guid? excludeUserId = null,
        CancellationToken ct = default)
    {
        if (studyGroupId.HasValue)
        {
            await NotifyStudyGroupAsync(studyGroupId.Value, message, excludeUserId, ct);
            return;
        }

        var userIds = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.IsActive)
            .Select(u => u.Id)
            .Where(id => excludeUserId == null || id != excludeUserId.Value)
            .ToArrayAsync(ct);

        await NotifyUsersAsync(userIds, message, ct);
    }

    public async Task<NotificationDto[]> GetAsync(
        Guid userId,
        int limit,
        DateTime? before = null,
        CancellationToken ct = default)
    {
        var take = Math.Clamp(limit, 1, 100);

        var query = _dbContext.Notifications
            .AsNoTracking()
            .Where(n => n.UserId == userId);

        if (before.HasValue)
            query = query.Where(n => n.CreatedAt < before.Value);

        return await query
            .OrderByDescending(n => n.CreatedAt)
            .Take(take)
            .Select(n => new NotificationDto(
                n.Id,
                n.Type.ToString(),
                n.Title,
                n.Body,
                n.Url,
                n.IsRead,
                n.CreatedAt))
            .ToArrayAsync(ct);
    }

    public Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default) =>
        _dbContext.Notifications
            .AsNoTracking()
            .CountAsync(n => n.UserId == userId && !n.IsRead, ct);

    public async Task<bool> MarkReadAsync(
        Guid userId,
        Guid notificationId,
        CancellationToken ct = default)
    {
        var notification = await _dbContext.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId, ct);

        if (notification is null)
            return false;

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            await _dbContext.SaveChangesAsync(ct);
        }

        return true;
    }

    public async Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default)
    {
        var unread = await _dbContext.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ToListAsync(ct);

        if (unread.Count == 0)
            return 0;

        foreach (var notification in unread)
            notification.IsRead = true;

        await _dbContext.SaveChangesAsync(ct);
        return unread.Count;
    }

    public async Task<bool> DeleteAsync(
        Guid userId,
        Guid notificationId,
        CancellationToken ct = default)
    {
        var notification = await _dbContext.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId, ct);

        if (notification is null)
            return false;

        _dbContext.Notifications.Remove(notification);
        await _dbContext.SaveChangesAsync(ct);
        return true;
    }

    private static (string Title, string Body, string? Url) Normalize(NotificationMessage message)
    {
        var title = string.IsNullOrWhiteSpace(message.Title)
            ? "Уведомление"
            : Truncate(message.Title.Trim(), TitleMaxLength);

        var body = Truncate(message.Body?.Trim() ?? string.Empty, BodyMaxLength);

        // Only relative SPA paths are allowed. "//host" is protocol-relative
        // and "/\host" is normalized to "//host" by browsers, so both would        // turn a notification click into an open redirect. The column is
        // varchar(500), so anything longer would fail on save.
        var url = message.Url?.Trim();
        if (string.IsNullOrWhiteSpace(url) ||
            url.Length > 500 ||
            !url.StartsWith('/') ||
            url.Contains('\\') ||
            (url.Length > 1 && url[1] == '/'))
        {
            url = null;
        }

        return (title, body, url);
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}
