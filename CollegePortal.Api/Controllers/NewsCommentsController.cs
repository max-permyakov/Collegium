using System.Security.Claims;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/news")]
public class NewsCommentsController : ControllerBase
{
    private readonly INewsCommentService _commentService;

    public NewsCommentsController(INewsCommentService commentService)
    {
        _commentService = commentService;
    }

    [HttpGet("{announcementId:guid}/comments")]
    [AllowAnonymous]
    public async Task<IActionResult> GetComments(Guid announcementId, CancellationToken ct)
    {
        var comments = await _commentService.GetByAnnouncementAsync(announcementId, ct);
        return comments == null
            ? NotFound(new { message = "Новость не найдена" })
            : Ok(comments);
    }

    [HttpPost("{announcementId:guid}/comments")]
    [Authorize]
    public async Task<IActionResult> PostComment(Guid announcementId, [FromBody] CreateNewsCommentDto dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var comment = await _commentService.PostAsync(announcementId, userId.Value, dto.Text, ct);
        return comment == null
            ? BadRequest(new { message = "Не удалось добавить комментарий" })
            : Ok(comment);
    }

    [HttpDelete("comments/{commentId:guid}")]
    [Authorize]
    public async Task<IActionResult> DeleteComment(Guid commentId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var (success, error) = await _commentService.DeleteAsync(commentId, userId.Value, User.IsInRole("Admin"), ct);
        return success ? Ok() : BadRequest(new { message = error ?? "Не удалось удалить комментарий" });
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}
