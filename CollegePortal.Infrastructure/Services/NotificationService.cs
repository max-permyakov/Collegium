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

    /// <summary>
    /// Club chat can burst dozens of messages; at most one ClubMessage
    /// notification per club URL is delivered within this window.
    /// </summary>
    private static readonly TimeSpan ClubAggregationWindow = TimeSpan.FromMinutes(10);

    /// <summary>Types users may turn off. System alerts stay always-on.</summary>
    private static readonly NotificationType[] ConfigurableTypes =
    [
        NotificationType.News,
        NotificationType.Assignment,
        NotificationType.ClubMessage,
        NotificationType.Comment
    ];

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
        var normalized = new NotificationMessage(message.Type, title, body, url);
        var recipientsAfterPreference = await ApplyPreferencesAsync(recipients, message.Type, ct);

        await NotifyUsersInternalAsync(recipientsAfterPreference, normalized, ct);
    }

    /// <summary>
    /// Removes users who opted out of <paramref name="type"/>. A missing
    /// preference row means the type is enabled, so only disabled rows are
    /// loaded from the preferences table.
    /// </summary>
    private async Task<IReadOnlyList<Guid>> ApplyPreferencesAsync(
        IReadOnlyCollection<Guid> recipients,
        NotificationType type,
        CancellationToken ct)
    {
        var disabledUserIds = await _dbContext.NotificationPreferences
            .AsNoTracking()
            .Where(p => p.IsDisabled && p.Type == type && recipients.Contains(p.UserId))
            .Select(p => p.UserId)
            .ToArrayAsync(ct);

        if (disabledUserIds.Length == 0)
            return recipients.ToArray();

        return recipients
            .Where(id => !disabledUserIds.Contains(id))
            .ToArray();
    }

    private async Task NotifyUsersInternalAsync(
        IEnumerable<Guid> userIds,
        NotificationMessage message,
        CancellationToken ct)
    {
        var notifications = userIds
            .Select(userId => new Notification
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Type = message.Type,
                Title = message.Title,
                Body = message.Body,
                Url = message.Url,
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            })
            .ToArray();

        if (notifications.Length == 0)
            return;

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

    public async Task NotifyClubMembersAsync(
        Guid clubId,
        string clubName,
        NotificationMessage message,
        Guid excludeUserId,
        CancellationToken ct = default)
    {
        var (title, body, url) = Normalize(message);
        url ??= $"/clubs/{clubId}";

        // Aggregation: skip when a notification for the same club was created
        // within the aggregation window. The club id is part of the URL, so
        // different clubs never collapse into each other.
        var aggregationCutoff = DateTime.UtcNow - ClubAggregationWindow;
        var recentExists = await _dbContext.Notifications
            .AsNoTracking()
            .AnyAsync(n =>
                n.Type == NotificationType.ClubMessage &&
                n.Url == url &&
                n.CreatedAt >= aggregationCutoff,
                ct);
        if (recentExists)
        {
            _logger.LogDebug(
                "Club message notification for club {ClubId} aggregated (one already sent within window)",
                clubId);
            return;
        }

        var userIds = await _dbContext.ClubMembers
            .AsNoTracking()
            .Where(m => m.ClubId == clubId && m.UserId != excludeUserId && m.User.IsActive)
            .Select(m => m.UserId)
            .ToArrayAsync(ct);

        var deliveredUserIds = await ApplyPreferencesAsync(userIds, message.Type, ct);

        await NotifyUsersInternalAsync(
            deliveredUserIds,
            new NotificationMessage(
                message.Type,
                $"«{clubName}»: {title}",
                body,
                url),
            ct);
    }

    public async Task<NotificationPreferenceDto[]> GetPreferencesAsync(Guid userId, CancellationToken ct = default)
    {
        var disabledTypes = await _dbContext.NotificationPreferences
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.IsDisabled)
            .Select(p => p.Type)
            .ToArrayAsync(ct);

        return ConfigurableTypes
            .Select(type => new NotificationPreferenceDto(
                type.ToString(),
                !disabledTypes.Contains(type)))
            .ToArray();
    }

    public async Task<NotificationPreferenceDto> SetPreferenceAsync(
        Guid userId,
        NotificationType type,
        bool enabled,
        CancellationToken ct = default)
    {
        if (!ConfigurableTypes.Contains(type))
            throw new ArgumentException("Notification type is not configurable", nameof(type));

        var preference = await _dbContext.NotificationPreferences
            .FirstOrDefaultAsync(p => p.UserId == userId && p.Type == type, ct);

        if (preference == null)
        {
            preference = new NotificationPreference
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Type = type,
                IsDisabled = !enabled,
                UpdatedAt = DateTime.UtcNow
            };
            _dbContext.NotificationPreferences.Add(preference);
        }
        else
        {
            preference.IsDisabled = !enabled;
            preference.UpdatedAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(ct);
        return new NotificationPreferenceDto(type.ToString(), enabled);
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
