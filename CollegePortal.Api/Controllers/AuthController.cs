using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequestDto request)
    {
        var result = await _authService.LoginAsync(request.Email, request.Password);
        if (result == null)
            return Unauthorized(new { message = "Неверный email или пароль" });

        return Ok(result);
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = GetCurrentUserId();
        if (userId.HasValue)
            await _authService.LogoutAsync(userId.Value);
        return Ok(new { message = "Выход выполнен" });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var user = await _authService.GetCurrentUserAsync(userId.Value);
        if (user == null)
            return NotFound(new { message = "Пользователь не найден" });

        return Ok(user);
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequestDto request)
    {
        var allowedRoles = new[] { "Student", "Admin" };
        if (!allowedRoles.Contains(request.Role))
            return BadRequest(new { message = "Недопустимая роль" });

        var result = await _authService.RegisterAsync(request.Email, request.Password, request.DisplayName, request.Role);
        if (result == null)
            return BadRequest(new { message = "Пользователь с таким email уже существует" });

        return Ok(result);
    }

    [HttpPost("assign-profile")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AssignStudentProfile([FromBody] AssignProfileRequestDto request)
    {
        var success = await _authService.AssignStudentProfileAsync(request.UserId, request.ExternalStudentId, request.StudyGroupId);
        if (!success)
            return BadRequest(new { message = "Не удалось привязать профиль. Проверьте данные." });

        return Ok(new { message = "Профиль успешно привязан" });
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}

public record AssignProfileRequestDto(
    Guid UserId,
    int ExternalStudentId,
    Guid StudyGroupId
);