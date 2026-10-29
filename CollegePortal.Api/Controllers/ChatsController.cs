using System.Security.Claims;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/chats")]
[Authorize]
public class ChatsController : ControllerBase
{
    /// <summary>Matches the biggest allowed upload: 512 MB attachments.</summary>
    private const long MaxRequestBodyBytes = 537_000_000;

    private readonly IChatService _chatService;
    private readonly IChatFileStore _fileStore;

    public ChatsController(IChatService chatService, IChatFileStore fileStore)
    {
        _chatService = chatService;
        _fileStore = fileStore;
    }

    [HttpGet("unread-total")]
    public async Task<IActionResult> UnreadTotal(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        return Ok(new { count = await _chatService.UnreadTotalAsync(userId.Value, ct) });
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? q, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        return Ok(await _chatService.SearchAsync(userId.Value, q, ct));
    }

    [HttpPost("find-or-create/{otherUserId:guid}")]
    public async Task<IActionResult> FindOrCreate(Guid otherUserId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        try
        {
            var chat = await _chatService.FindOrCreateAsync(userId.Value, otherUserId, ct);
            if (chat == null)
                return NotFound(new { message = "Пользователь не найден" });
            return Ok(chat);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Returns the caller's «Избранное» thread, creating it on first access.</summary>
    [HttpPost("saved")]
    public async Task<IActionResult> GetOrCreateSaved(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        return Ok(await _chatService.GetOrCreateSpecialAsync(userId.Value, ChatKind.Saved, ct));
    }

    /// <summary>Returns the caller's «Поддержка» thread, creating it on first access.</summary>
    [HttpPost("support")]
    public async Task<IActionResult> GetOrCreateSupport(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        return Ok(await _chatService.GetOrCreateSpecialAsync(userId.Value, ChatKind.Support, ct));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetChat(Guid id, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var chat = await _chatService.GetAsync(id, userId.Value, User.IsInRole("Admin"), ct);
        return chat == null ? NotFound(new { message = "Чат не найден" }) : Ok(chat);
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        return Ok(await _chatService.GetListAsync(userId.Value, ct));
    }

    [HttpGet("{id:guid}/messages")]
    public async Task<IActionResult> GetMessages(
        Guid id,
        [FromQuery] int? latest,
        [FromQuery] long? beforeSeq,
        [FromQuery] long? afterSeq,
        [FromQuery] int? limit,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var messages = await _chatService.GetMessagesAsync(
            id, userId.Value, latest, beforeSeq, afterSeq, limit, User.IsInRole("Admin"), ct);
        return messages == null ? NotFound(new { message = "Чат не найден" }) : Ok(messages);
    }

    [HttpPost("{id:guid}/messages")]
    public async Task<IActionResult> SendMessage(Guid id, [FromBody] SendChatMessageDto? dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _chatService.SendAsync(
            id, userId.Value, dto ?? new SendChatMessageDto(null, null, null), User.IsInRole("Admin"), ct);
        if (result.Error != null)
            return BadRequest(new { message = result.Error });
        return Ok(result.Message);
    }

    /// <summary>
    /// Raw-body upload: the request stream is written straight to disk, so even
    /// a 512 MB attachment never materializes in memory. Metadata arrives via
    /// query (?kind=file|voice|circle&fileName=...), the binary via the body.
    /// </summary>
    [HttpPost("{id:guid}/upload")]
    [RequestSizeLimit(537_000_000)]
    public async Task<IActionResult> Upload(
        Guid id,
        [FromQuery] string kind,
        [FromQuery] string? fileName,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        if (Request.ContentLength is > MaxRequestBodyBytes)
            return BadRequest(new { message = "Файл превышает лимит 512 МБ" });

        var contentType = Request.ContentType;

        try
        {
            var result = await _chatService.SaveUploadAsync(
                id, userId.Value, kind, Request.Body, fileName, contentType, User.IsInRole("Admin"), ct);
            if (result.Error != null)
                return BadRequest(new { message = result.Error });
            return Ok(result.Upload);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var ok = await _chatService.MarkReadAsync(id, userId.Value, User.IsInRole("Admin"), ct);
        return ok ? Ok(new { updated = true }) : NotFound(new { message = "Чат не найден" });
    }

    [HttpDelete("messages/{messageId:long}")]
    public async Task<IActionResult> DeleteMessage(long messageId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _chatService.DeleteMessageAsync(messageId, userId.Value, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    /// <summary>
    /// Streams a chat attachment with cookie auth (works for img/video/audio
    /// and plain downloads) and HTTP range processing so media controls seek.
    /// </summary>
    [HttpGet("files/{messageId:long}")]
    public async Task<IActionResult> GetFile(long messageId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var access = await _chatService.GetFileAsync(messageId, userId.Value, User.IsInRole("Admin"), ct);
        if (access == null)
            return NotFound(new { message = "Файл не найден" });

        var path = _fileStore.GetPath(access.StorageKey);
        if (!System.IO.File.Exists(path))
            return NotFound(new { message = "Файл не найден" });

        Response.Headers.CacheControl = "private, max-age=3600";
        var lastModified = new DateTimeOffset(access.CreatedAt, TimeSpan.Zero);

        var forceDownload = Request.Query.ContainsKey("download");
        return new PhysicalFileResult(path, access.ContentType)
        {
            FileDownloadName = forceDownload || !access.Inline ? access.FileName : string.Empty,
            LastModified = lastModified,
            EnableRangeProcessing = true
        };
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (claim != null && Guid.TryParse(claim.Value, out var id))
            return id;
        return null;
    }
}
