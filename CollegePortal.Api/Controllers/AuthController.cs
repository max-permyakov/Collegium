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

    [HttpPost("diary-login")]
    [AllowAnonymous]
    public async Task<IActionResult> DiaryLogin([FromBody] DiaryLoginRequestDto request)
    {
        // Client sends login and pre-computed SHA256 hash of login
        var result = await _authService.DiaryLoginAsync(request.Login, request.PasswordHash);
        if (result == null)
            return Unauthorized(new { message = "Неверный логин или пароль дневника" });

        return Ok(result);
    }

    [HttpPost("diary-relogin")]
    [Authorize]
    public async Task<IActionResult> DiaryRelogin()
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _authService.DiaryReloginAsync(userId.Value);
        if (result == null)
            return Unauthorized(new { message = "Сессия дневника истекла, требуется повторный вход" });

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

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim != null && Guid.TryParse(userIdClaim.Value, out var userId))
            return userId;
        return null;
    }
}

public record DiaryLoginRequestDto(
    string Login,
    string PasswordHash
);