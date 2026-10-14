using System.Security.Claims;
using System.Text;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    // Moscow is UTC+3 all year round (no DST since 2014).
    private const int MoscowUtcOffsetHours = 3;

    private readonly IAdminService _adminService;
    private readonly IProfileService _profileService;
    private readonly CollegePortalDbContext _dbContext;

    public AdminController(IAdminService adminService, IProfileService profileService, CollegePortalDbContext dbContext)
    {
        _adminService = adminService;
        _profileService = profileService;
        _dbContext = dbContext;
    }

    [HttpGet("statistics")]
    public async Task<IActionResult> GetStatistics(CancellationToken ct)
    {
        var stats = await _adminService.GetStatisticsAsync(ct);
        return Ok(stats);
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(CancellationToken ct)
    {
        var users = await _adminService.GetUsersAsync(ct);
        return Ok(users);
    }

    [HttpGet("users/{id:guid}")]
    public async Task<IActionResult> GetUser(Guid id, CancellationToken ct)
    {
        var adminId = GetCurrentUserId();
        if (!adminId.HasValue)
            return Unauthorized();

        var detail = await _adminService.GetUserDetailAsync(adminId.Value, id, ct);
        return detail == null ? NotFound() : Ok(detail);
    }

    [HttpPost("users/{id:guid}/role")]
    public async Task<IActionResult> SetRole(Guid id, [FromBody] UpdateRoleRequestDto request, CancellationToken ct)
    {
        var adminId = GetCurrentUserId();
        if (!adminId.HasValue)
            return Unauthorized();

        var result = await _adminService.SetRoleAsync(adminId.Value, id, request.Role, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("users/{id:guid}/is-active")]
    public async Task<IActionResult> SetIsActive(Guid id, [FromBody] UpdateIsActiveRequestDto request, CancellationToken ct)
    {
        var adminId = GetCurrentUserId();
        if (!adminId.HasValue)
            return Unauthorized();

        var result = await _adminService.SetIsActiveAsync(adminId.Value, id, request.IsActive, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("users/{id:guid}/headman")]
    public async Task<IActionResult> SetHeadman(Guid id, [FromBody] UpdateHeadmanRequestDto request, CancellationToken ct)
    {
        var adminId = GetCurrentUserId();
        if (!adminId.HasValue)
            return Unauthorized();

        var result = await _adminService.SetHeadmanAsync(adminId.Value, id, request.HeadmanRole, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpPost("users/{id:guid}/recompute-grades")]
    public async Task<IActionResult> RecomputeGrades(Guid id, CancellationToken ct)
    {
        var adminId = GetCurrentUserId();
        if (!adminId.HasValue)
            return Unauthorized();

        var result = await _adminService.RecomputeGradesAsync(id, ct);
        return result.Success ? Ok() : BadRequest(new { message = result.Error });
    }

    [HttpGet("audit")]
    public async Task<IActionResult> GetAudit([FromQuery] int limit = 100, CancellationToken ct = default)
    {
        var audit = await _adminService.GetAuditAsync(limit, ct);
        return Ok(audit);
    }

    [HttpGet("users.csv")]
    public async Task<IActionResult> ExportUsers(CancellationToken ct)
    {
        var adminId = GetCurrentUserId();
        if (!adminId.HasValue)
            return Unauthorized();

        var users = await _adminService.GetUsersAsync(ct);
        if (users.Count == 0)
        {
            var empty = Encoding.UTF8.GetBytes("Login;ФИО;Email;Телефон;Группа;Курс;Роль;Статус;Староста;Средний балл;Последний вход\n");
            return File(empty, "text/csv; charset=utf-8", "users.csv");
        }

        var sb = new StringBuilder();
        sb.AppendLine("Login;ФИО;Email;Телефон;Группа;Курс;Роль;Статус;Староста;Средний балл;Последний вход");

        foreach (var u in users)
        {
            var line = string.Join(";",
                EscapeCsv(u.Login),
                EscapeCsv(u.DisplayName),
                EscapeCsv(u.Email),
                EscapeCsv(u.PhoneNumber),
                EscapeCsv(u.StudyGroupName),
                u.Course?.ToString() ?? "",
                u.Role,
                u.IsActive ? "Активен" : "Заблокирован",
                EscapeCsv(u.HeadmanRole),
                u.AverageMark?.ToString("F2") ?? "",
                u.LastLoginAt?.AddHours(MoscowUtcOffsetHours).ToString("yyyy-MM-dd HH:mm") ?? ""
            );
            sb.AppendLine(line);
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        return File(bytes, "text/csv; charset=utf-8", "users.csv");
    }

    private static string EscapeCsv(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "";
        var escaped = value.Replace("\"", "\"\"");
        return $"\"{escaped}\"";
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}