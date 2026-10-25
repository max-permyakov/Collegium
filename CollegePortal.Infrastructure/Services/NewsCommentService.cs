using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class NewsCommentService : INewsCommentService
{
    private const int MaxCommentLength = 2000;

    private readonly CollegePortalDbContext _dbContext;
    private readonly INotificationService _notifications;
    private readonly ILogger<NewsCommentService> _logger;

    public NewsCommentService(
        CollegePortalDbContext dbContext,
        INotificationService notifications,
        ILogger<NewsCommentService> logger)
    {
        _dbContext = dbContext;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task<NewsCommentDto[]?> GetByAnnouncementAsync(Guid announcementId, CancellationToken ct = default)
    {
        var exists = await _dbContext.Announcements
            .AsNoTracking()
            .AnyAsync(a => a.Id == announcementId && a.IsPublished && a.PublishedAt <= DateTime.UtcNow, ct);
        if (!exists)
            return null;

        return await _dbContext.NewsComments
            .AsNoTracking()
            .Where(c => c.AnnouncementId == announcementId)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new NewsCommentDto(
                c.Id,
                c.AnnouncementId,
                c.UserId,
                c.User.DisplayName,
                c.User.StudentProfile != null ? c.User.StudentProfile.AvatarDataUrl : null,
                c.Text,
                c.CreatedAt,
                c.UpdatedAt
            ))
            .ToArrayAsync(ct);
    }

    public async Task<NewsCommentDto?> PostAsync(Guid announcementId, Guid userId, string text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text))
            return null;

        var trimmed = text.Trim();
        if (trimmed.Length > MaxCommentLength)
            trimmed = trimmed[..MaxCommentLength];

        var announcement = await _dbContext.Announcements
            .AsNoTracking()
            .Where(a => a.Id == announcementId && a.IsPublished && a.PublishedAt <= DateTime.UtcNow)
            .Select(a => new { a.Id, a.AuthorId, a.Title })
            .FirstOrDefaultAsync(ct);
        if (announcement == null)
            return null;

        var comment = new NewsComment
        {
            Id = Guid.NewGuid(),
            AnnouncementId = announcementId,
            UserId = userId,
            Text = trimmed,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.NewsComments.Add(comment);
        await _dbContext.SaveChangesAsync(ct);

        var user = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.StudentProfile)
            .FirstOrDefaultAsync(u => u.Id == userId, ct);

        // Only the news author is notified. A comment failure must not fail the
        // comment that has already been saved.
        if (announcement.AuthorId != userId)
        {
            try
            {
                var preview = trimmed.Length > 200 ? trimmed[..200] : trimmed;
                await _notifications.NotifyUsersAsync(
                    new[] { announcement.AuthorId },
                    new NotificationMessage(
                        NotificationType.Comment,
                        "Новый комментарий",
                        $"«{announcement.Title}»: {preview}",
                        "/news"),
                    ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to notify author {AuthorId} about comment {CommentId}",
                    announcement.AuthorId,
                    comment.Id);
            }
        }

        return new NewsCommentDto(
            comment.Id,
            comment.AnnouncementId,
            comment.UserId,
            user?.DisplayName ?? "",
            user?.StudentProfile?.AvatarDataUrl,
            comment.Text,
            comment.CreatedAt,
            comment.UpdatedAt
        );
    }

    public async Task<(bool Success, string? Error)> UpdateAsync(Guid commentId, Guid userId, bool isAdmin, string text, CancellationToken ct = default)
    {
        var comment = await _dbContext.NewsComments
            .FirstOrDefaultAsync(c => c.Id == commentId, ct);
        if (comment == null)
            return (false, "Комментарий не найден");

        if (!isAdmin && comment.UserId != userId)
            return (false, "Недостаточно прав");

        var trimmed = text.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return (false, "Комментарий не может быть пустым");
        if (trimmed.Length > MaxCommentLength)
            trimmed = trimmed[..MaxCommentLength];

        comment.Text = trimmed;
        comment.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(Guid commentId, Guid userId, bool isAdmin, CancellationToken ct = default)
    {
        var comment = await _dbContext.NewsComments
            .FirstOrDefaultAsync(c => c.Id == commentId, ct);
        if (comment == null)
            return (false, "Комментарий не найден");

        if (!isAdmin && comment.UserId != userId)
            return (false, "Недостаточно прав");

        _dbContext.NewsComments.Remove(comment);
        await _dbContext.SaveChangesAsync(ct);
        return (true, null);
    }
}
