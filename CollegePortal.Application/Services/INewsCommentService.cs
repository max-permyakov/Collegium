using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface INewsCommentService
{
    Task<NewsCommentDto[]?> GetByAnnouncementAsync(Guid announcementId, CancellationToken ct = default);
    Task<NewsCommentDto?> PostAsync(Guid announcementId, Guid userId, string text, CancellationToken ct = default);

    Task<(bool Success, string? Error)> UpdateAsync(Guid commentId, Guid userId, bool isAdmin, string text, CancellationToken ct = default);

    Task<(bool Success, string? Error)> DeleteAsync(Guid commentId, Guid userId, bool isAdmin, CancellationToken ct = default);
}
