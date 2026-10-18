using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;

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

    private string AccessCookieName => _configuration["Auth:CookieName"] ?? "cp_access";
    private string RefreshCookieName => _configuration["Auth:RefreshCookieName"] ?? "cp_refresh";

    private TimeSpan ConfiguredRefreshLifetime =>
        TimeSpan.FromDays(_configuration.GetValue("Auth:RefreshTokenDays", 30));

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginRequestDto request)
    {
        var result = await _authService.LoginAsync(request.Email, request.Password);
        if (result == null)
            return Unauthorized(new { message = "Неверный email или пароль" });

        SetAuthCookies(result);
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

        SetAuthCookies(result);
        return Ok(result.User);
    }

    // Exchanges the long-lived refresh cookie for a fresh access token (and a
    // rotated refresh token — sliding session). Anonymous: authentication for
    // this endpoint comes from the refresh cookie itself.
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh()
    {
        if (!Request.Cookies.TryGetValue(RefreshCookieName, out var refreshToken) ||
            string.IsNullOrWhiteSpace(refreshToken))
        {
            return Unauthorized(new { message = "Требуется вход" });
        }

        var result = await _authService.RefreshSessionAsync(refreshToken);
        if (result == null)
        {
            ClearAuthCookies();
            return Unauthorized(new { message = "Сессия недействительна, войдите заново" });
        }

        SetAuthCookies(result);
        return Ok(result.User);
    }

    [HttpPost("diary-relogin")]
    [Authorize]
    public async Task<IActionResult> DiaryRelogin()
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        Request.Cookies.TryGetValue(RefreshCookieName, out var refreshToken);
        var result = await _authService.DiaryReloginAsync(userId.Value, refreshToken);
        if (result == null)
            return Unauthorized(new { message = "Сессия дневника истекла, требуется повторный вход" });

        SetAuthCookies(result);
        return Ok(result.User);
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = GetCurrentUserId();
        Request.Cookies.TryGetValue(RefreshCookieName, out var refreshToken);
        if (userId.HasValue)
            await _authService.LogoutAsync(userId.Value, refreshToken);

        ClearAuthCookies();
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

    [HttpPost("claim-primary-admin")]
    [Authorize]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ClaimPrimaryAdmin([FromBody] ClaimPrimaryAdminRequestDto request)
    {
        var secretConfigured =
            !string.IsNullOrWhiteSpace(_configuration["PrimaryAdmin:Secret"]) ||
            !string.IsNullOrWhiteSpace(_configuration["PrimaryAdmin:SecretHash"]);

        if (!secretConfigured)
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { message = "Повышение до главного администратора не настроено" });

        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _authService.ClaimPrimaryAdminAsync(userId.Value, request.Password);
        if (result == null)
            return Unauthorized(new { message = "Неверный пароль" });

        SetAuthCookies(result);
        return Ok(result.User);
    }

    // Two cookies: a short-lived access token (readable by the API on every
    // request) and a long-lived refresh token scoped to /api/auth so it is
    // only ever sent to the auth endpoints.
    private void SetAuthCookies(LoginResponseDto session)
    {
        var isDevelopment = _environment.IsDevelopment();

        Response.Cookies.Append(AccessCookieName, session.AccessToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = !isDevelopment,
            SameSite = isDevelopment ? SameSiteMode.Lax : SameSiteMode.Strict,
            Path = "/",
            Expires = session.ExpiresAt,
            IsEssential = true
        });

        Response.Cookies.Append(RefreshCookieName, session.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = !isDevelopment,
            SameSite = isDevelopment ? SameSiteMode.Lax : SameSiteMode.Strict,
            Path = "/api/auth",
            Expires = DateTime.UtcNow.Add(ConfiguredRefreshLifetime),
            IsEssential = true
        });
    }

    private void ClearAuthCookies()
    {
        var isDevelopment = _environment.IsDevelopment();
        var sameSite = isDevelopment ? SameSiteMode.Lax : SameSiteMode.Strict;

        Response.Cookies.Delete(AccessCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = !isDevelopment,
            SameSite = sameSite,
            Path = "/"
        });
        Response.Cookies.Delete(RefreshCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = !isDevelopment,
            SameSite = sameSite,
            Path = "/api/auth"
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
