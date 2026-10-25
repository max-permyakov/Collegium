using System.Security.Claims;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly INotificationService _notifications;

    public NotificationsController(INotificationService notifications)
    {
        _notifications = notifications;
    }

    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] int limit = 30,
        [FromQuery] DateTime? before = null,
        CancellationToken ct = default)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var notifications = await _notifications.GetAsync(userId, limit, before, ct);
        return Ok(notifications);
    }

    [HttpGet("unread-count")]
    public async Task<IActionResult> GetUnreadCount(CancellationToken ct = default)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var count = await _notifications.GetUnreadCountAsync(userId, ct);
        return Ok(new { count });
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct = default)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var success = await _notifications.MarkReadAsync(userId, id, ct);
        return success
            ? Ok(new { isRead = true })
            : NotFound(new { message = "Уведомление не найдено" });
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct = default)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var updated = await _notifications.MarkAllReadAsync(userId, ct);
        return Ok(new { updated });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        var success = await _notifications.DeleteAsync(userId, id, ct);
        return success
            ? Ok(new { deleted = true })
            : NotFound(new { message = "Уведомление не найдено" });
    }

    /// <summary>
    /// Sends a test notification to the current user. Guarded by the Admin role
    /// so it cannot be used to spam arbitrary accounts.
    /// </summary>
    [HttpPost("test")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SendTest(CancellationToken ct = default)
    {
        if (!TryGetUserId(out var userId))
            return Unauthorized();

        await _notifications.NotifyUsersAsync(
            new[] { userId },
            new NotificationMessage(
                NotificationType.System,
                "Тестовое уведомление",
                "Push и всплывающие уведомления работают.",
                "/profile"),
            ct);

        return Ok(new { sent = true });
    }

    private bool TryGetUserId(out Guid userId)
    {
        userId = Guid.Empty;
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out userId);
    }
}
