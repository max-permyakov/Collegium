using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/news")]
public class AnnouncementsController : ControllerBase
{
    private readonly IAnnouncementService _announcementService;

    public AnnouncementsController(IAnnouncementService announcementService)
    {
        _announcementService = announcementService;
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
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create([FromBody] CreateAnnouncementDto dto)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var announcement = await _announcementService.CreateAsync(userId.Value, dto);
        return CreatedAtAction(nameof(GetById), new { id = announcement.Id }, announcement);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
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
    [Authorize(Roles = "Admin")]
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
    [Authorize(Roles = "Admin")]
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

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}