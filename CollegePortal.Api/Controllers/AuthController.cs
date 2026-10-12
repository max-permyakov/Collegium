using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public AuthController(IAuthService authService, IConfiguration configuration, IWebHostEnvironment environment)
    {
        _authService = authService;
        _configuration = configuration;
        _environment = environment;
    }

    private string CookieName => _configuration["Auth:CookieName"] ?? "cp_access";

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginRequestDto request)
    {
        var result = await _authService.LoginAsync(request.Email, request.Password);
        if (result == null)
            return Unauthorized(new { message = "Неверный email или пароль" });

        SetAuthCookie(result.AccessToken, result.ExpiresAt);
        return Ok(result.User);
    }

    [HttpPost("diary-login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> DiaryLogin([FromBody] DiaryLoginRequestDto request)
    {
        // The diary API expects the password pre-hashed (SHA-256, base64) by the client.
        var result = await _authService.DiaryLoginAsync(request.Login, request.PasswordHash);
        if (result == null)
            return Unauthorized(new { message = "Неверный логин или пароль дневника" });

        SetAuthCookie(result.AccessToken, result.ExpiresAt);
        return Ok(result.User);
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

        SetAuthCookie(result.AccessToken, result.ExpiresAt);
        return Ok(result.User);
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = GetCurrentUserId();
        if (userId.HasValue)
            await _authService.LogoutAsync(userId.Value);

        ClearAuthCookie();
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

    private void SetAuthCookie(string token, DateTime expiresAt)
    {
        var isDevelopment = _environment.IsDevelopment();

        Response.Cookies.Append(CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            Secure = !isDevelopment,
            SameSite = isDevelopment ? SameSiteMode.Lax : SameSiteMode.Strict,
            Path = "/",
            Expires = expiresAt,
            IsEssential = true
        });
    }

    private void ClearAuthCookie()
    {
        Response.Cookies.Delete(CookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = !_environment.IsDevelopment(),
            SameSite = _environment.IsDevelopment() ? SameSiteMode.Lax : SameSiteMode.Strict,
            Path = "/"
        });
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
