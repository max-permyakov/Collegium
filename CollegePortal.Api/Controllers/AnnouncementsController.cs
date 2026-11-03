using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/news")]
public class AnnouncementsController : ControllerBase
{
    private readonly IAnnouncementService _announcementService;
    private readonly IChatFileStore _fileStore;

    /// <summary>Max size of a news cover image.</summary>
    private const long MaxImageBytes = 8 * 1024 * 1024;

    private static readonly Dictionary<string, string> AllowedImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".gif"] = "image/gif",
        [".webp"] = "image/webp",
    };

    public AnnouncementsController(IAnnouncementService announcementService, IChatFileStore fileStore)
    {
        _announcementService = announcementService;
        _fileStore = fileStore;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetNews([FromQuery] string? group = null)
    {
        Guid? studyGroupId = null;
        if (!string.IsNullOrEmpty(group) && Guid.TryParse(group, out var gid))
            studyGroupId = gid;

        var news = await _announcementService.GetPublishedAsync(studyGroupId);
        return Ok(news);
    }

    [HttpGet("{id}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetById(Guid id)
    {
        var announcement = await _announcementService.GetByIdAsync(id);
        if (announcement == null)
            return NotFound(new { message = "Новость не найдена" });

        return Ok(announcement);
    }

    [HttpPost]
    [Authorize(Policy = "Permission.NewsManage")]
    public async Task<IActionResult> Create([FromBody] CreateAnnouncementDto dto)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var announcement = await _announcementService.CreateAsync(userId.Value, dto);
        return CreatedAtAction(nameof(GetById), new { id = announcement.Id }, announcement);
    }

    [HttpPut("{id}")]
    [Authorize(Policy = "Permission.NewsManage")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAnnouncementDto dto)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var announcement = await _announcementService.UpdateAsync(id, userId.Value, dto);
        if (announcement == null)
            return NotFound(new { message = "Новость не найдена или нет прав доступа" });

        return Ok(announcement);
    }

    [HttpDelete("{id}")]
    [Authorize(Policy = "Permission.NewsManage")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var success = await _announcementService.DeleteAsync(id, userId.Value);
        if (!success)
            return NotFound(new { message = "Новость не найдена или нет прав доступа" });

        return Ok(new { message = "Новость удалена" });
    }

    [HttpPatch("{id}/toggle-published")]
    [Authorize(Policy = "Permission.NewsManage")]
    public async Task<IActionResult> TogglePublished(Guid id)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var success = await _announcementService.TogglePublishedAsync(id, userId.Value);
        if (!success)
            return NotFound(new { message = "Новость не найдена или нет прав доступа" });

        return Ok(new { message = "Статус публикации изменен" });
    }

    /// <summary>
    /// Cover image upload. The client streams the binary in the raw request
    /// body and passes the file name via query (?fileName=photo.jpg), so no
    /// multipart parsing is needed (mirrors the chat upload flow).
    /// </summary>
    [HttpPost("image")]
    [Authorize(Policy = "Permission.NewsManage")]
    [RequestSizeLimit(MaxImageBytes)]
    public async Task<IActionResult> UploadImage(
        [FromQuery] string? fileName,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        if (Request.ContentLength is > MaxImageBytes)
            return BadRequest(new { message = "Картинка больше 8 МБ" });

        var extension = Path.GetExtension(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(extension) ||
            !AllowedImageExtensions.TryGetValue(extension, out var contentType))
        {
            return BadRequest(new { message = "Поддерживаются jpg, png, gif и webp" });
        }

        try
        {
            var stored = await _fileStore.SaveAsync(Request.Body, ct);

            // Store the (path-free) extension with the key so the file endpoint
            // can answer with the right content type per stored file.
            var key = $"{stored.StorageKey}{extension.ToLowerInvariant()}";
            return Ok(new NewsImageDto(Guid.NewGuid(), $"/api/news/files/{key}"));
        }
        catch (OperationCanceledException)
        {
            throw;
        }
    }

    /// <summary>Public read access to news cover images. News themselves are public.</summary>
    [HttpGet("files/{*key}")]
    [AllowAnonymous]
    public IActionResult GetFile(string key)
    {
        // The stored key is "yyyy/mm/<guid><ext>"; only that shape is accepted
        // to rule out any traversal attempt.
        var parts = key.Split(',', StringSplitOptions.RemoveEmptyEntries);
        var normalized = string.Join('/', parts);
        var extension = Path.GetExtension(normalized);
        if (string.IsNullOrWhiteSpace(extension) ||
            !AllowedImageExtensions.TryGetValue(extension, out var contentType) ||
            !normalized.Contains('/', StringComparison.Ordinal))
        {
            return BadRequest(new { message = "Некорректный путь к файлу" });
        }

        try
        {
            var path = _fileStore.GetPath(normalized);
            if (!System.IO.File.Exists(path))
                return NotFound();

            return new PhysicalFileResult(path, contentType) { FileDownloadName = Path.GetFileName(normalized) };
        }
        catch (ArgumentException)
        {
            return BadRequest(new { message = "Некорректный путь к файлу" });
        }
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}