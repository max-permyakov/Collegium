using System.Text.Json;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;

namespace CollegePortal.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private const string OAuthStateCookie = "cp_oauth_state";
    private const string OAuthPendingCookie = "cp_oauth_pending";

    private readonly IAuthService _authService;
    private readonly IOAuthService _oauthService;
    private readonly ICollegeInfoService _collegeInfoService;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly IDataProtector _stateProtector;

    public AuthController(
        IAuthService authService,
        IOAuthService oauthService,
        ICollegeInfoService collegeInfoService,
        IConfiguration configuration,
        IWebHostEnvironment environment,
        IDataProtectionProvider dataProtectionProvider)
    {
        _authService = authService;
        _oauthService = oauthService;
        _collegeInfoService = collegeInfoService;
        _configuration = configuration;
        _environment = environment;
        _stateProtector = dataProtectionProvider.CreateProtector("OAuthState");
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

    [HttpGet("providers")]
    [AllowAnonymous]
    public async Task<IActionResult> GetProviders(CancellationToken ct)
    {
        return Ok(await _authService.GetAuthProvidersAsync(ct));
    }

    [HttpGet("groups")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> GetGroups(CancellationToken ct)
    {
        var catalog = await _collegeInfoService.GetCatalogAsync(ct);
        return Ok(new GroupOptionsDto(catalog?.Groups ?? Array.Empty<string>()));
    }

    [HttpPost("email/request-code")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> RequestEmailCode(
        [FromBody] RequestEmailCodeRequestDto request,
        CancellationToken ct)
    {
        Request.Cookies.TryGetValue(OAuthPendingCookie, out var pendingCookie);
        var pendingToken = string.IsNullOrWhiteSpace(request.PendingOAuthToken)
            ? pendingCookie
            : request.PendingOAuthToken;

        var result = await _authService.RequestEmailCodeAsync(request.Email, pendingToken, ct);
        return result.Sent ? Ok(result) : BadRequest(result);
    }

    [HttpPost("email/verify-code")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> VerifyEmailCode(
        [FromBody] VerifyEmailCodeRequestDto request,
        CancellationToken ct)
    {
        var result = await _authService.VerifyEmailCodeAsync(request.Email, request.Code, ct);
        if (!result.Success)
            return result.Conflict ? Conflict(result) : BadRequest(result);

        if (result.Session != null)
        {
            SetAuthCookies(result.Session);
            ClearOAuthPendingCookie();
        }

        return Ok(result);
    }

    [HttpPost("email/complete-registration")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> CompleteEmailRegistration(
        [FromBody] CompleteEmailRegistrationRequestDto request,
        CancellationToken ct)
    {
        var result = await _authService.CompleteEmailRegistrationAsync(request, ct);
        if (result.Session == null)
            return result.Conflict
                ? Conflict(new { message = result.Error })
                : BadRequest(new { message = result.Error });

        SetAuthCookies(result.Session);
        ClearOAuthPendingCookie();
        return Ok(result.Session.User);
    }

    [HttpPost("complete-profile")]
    [Authorize]
    public async Task<IActionResult> CompleteProfile(
        [FromBody] CompleteProfileRequestDto request,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _authService.CompleteProfileAsync(userId.Value, request, ct);
        if (!result.Success)
            return BadRequest(new { message = result.Error });

        var user = await _authService.GetCurrentUserAsync(userId.Value, ct);
        return user == null ? NotFound() : Ok(user);
    }

    [HttpPost("link-diary")]
    [Authorize]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> LinkDiary(
        [FromBody] LinkDiaryRequestDto request,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return Unauthorized();

        var result = await _authService.LinkDiaryAsync(userId.Value, request.Login, request.PasswordHash, ct);
        if (result.Session == null)
            return result.Conflict
                ? Conflict(new { message = result.Error, code = "diary_already_linked" })
                : BadRequest(new { message = result.Error });

        SetAuthCookies(result.Session);
        return Ok(result.Session.User);
    }

    [HttpGet("external/{provider}/start")]
    [AllowAnonymous]
    public IActionResult ExternalStart([FromRoute] string provider, [FromQuery] string? returnUrl)
    {
        var method = ParseProvider(provider);
        if (method == null || !_oauthService.IsEnabled(method.Value))
            return NotFound(new { message = "Провайдер входа не настроен" });

        var safeReturnUrl = NormalizeReturnUrl(returnUrl);
        var redirectUri = BuildExternalRedirectUri(method.Value, provider);
        var authorization = _oauthService.CreateAuthorizationRequest(method.Value, redirectUri);

        var payload = new OAuthStatePayload(
            method.Value,
            authorization.State,
            authorization.CodeVerifier,
            safeReturnUrl);
        var protectedState = _stateProtector.Protect(JsonSerializer.Serialize(payload));

        Response.Cookies.Append(OAuthStateCookie, protectedState, new CookieOptions
        {
            HttpOnly = true,
            Secure = !_environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path = "/api/auth/external",
            Expires = DateTime.UtcNow.AddMinutes(10),
            IsEssential = true
        });

        return Redirect(authorization.AuthorizationUrl);
    }

    [HttpGet("external/{provider}/callback")]
    [AllowAnonymous]
    public async Task<IActionResult> ExternalCallback(
        [FromRoute] string provider,
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        CancellationToken ct)
    {
        var method = ParseProvider(provider);
        var frontend = FrontendBaseUrl;

        if (method == null)
            return Redirect($"{frontend}/login?oauth_error=provider");

        Request.Cookies.TryGetValue(OAuthStateCookie, out var protectedState);
        ClearOAuthStateCookie();

        OAuthStatePayload? payload = null;
        try
        {
            if (!string.IsNullOrWhiteSpace(protectedState))
                payload = JsonSerializer.Deserialize<OAuthStatePayload>(_stateProtector.Unprotect(protectedState));
        }
        catch
        {
            payload = null;
        }

        if (payload == null || payload.Provider != method.Value ||
            string.IsNullOrWhiteSpace(state) || !FixedTimeEquals(payload.State, state))
        {
            return Redirect($"{frontend}/login?oauth_error=state");
        }

        if (!string.IsNullOrWhiteSpace(error) || string.IsNullOrWhiteSpace(code))
            return Redirect($"{frontend}/login?oauth_error=cancelled");

        var redirectUri = BuildExternalRedirectUri(method.Value, provider);
        var identity = await _oauthService.ExchangeCodeAsync(method.Value, code, payload.CodeVerifier, redirectUri, ct);
        if (identity == null)
            return Redirect($"{frontend}/login?oauth_error=exchange");

        var result = await _authService.ExternalLoginAsync(identity, ct);
        if (result.RequiresEmail)
        {
            if (!string.IsNullOrWhiteSpace(result.PendingOAuthToken))
            {
                Response.Cookies.Append(OAuthPendingCookie, result.PendingOAuthToken, new CookieOptions
                {
                    HttpOnly = true,
                    Secure = !_environment.IsDevelopment(),
                    SameSite = SameSiteMode.Lax,
                    Path = "/api/auth",
                    Expires = DateTime.UtcNow.AddMinutes(15),
                    IsEssential = true
                });
            }

            return Redirect($"{frontend}/login?oauth_email=1&provider={method.Value}");
        }

        if (result.Session == null)
            return Redirect($"{frontend}/login?oauth_error=account");

        SetAuthCookies(result.Session);
        var destination = result.Session.User.RequiresProfileSetup
            ? "/complete-profile"
            : payload.ReturnUrl;
        return Redirect($"{frontend}{destination}");
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

    private string FrontendBaseUrl
    {
        get
        {
            var configured = _configuration["Client:BaseUrl"];
            if (!string.IsNullOrWhiteSpace(configured))
                return configured.TrimEnd('/');

            var cors = _configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
            if (cors is { Length: > 0 })
                return cors[0].TrimEnd('/');

            return $"{Request.Scheme}://{Request.Host}";
        }
    }

    private string BuildExternalRedirectUri(AuthMethod provider, string providerSlug)
    {
        var baseUrl = _configuration["OAuth:RedirectBaseUrl"];
        if (string.IsNullOrWhiteSpace(baseUrl))
            baseUrl = $"{Request.Scheme}://{Request.Host}";

        return $"{baseUrl.TrimEnd('/')}/api/auth/external/{providerSlug}/callback";
    }

    private static AuthMethod? ParseProvider(string provider) => provider.Trim().ToLowerInvariant() switch
    {
        "google" => AuthMethod.Google,
        "github" => AuthMethod.GitHub,
        "yandex" => AuthMethod.Yandex,
        "vk" => AuthMethod.Vk,
        _ => null
    };

    private static string NormalizeReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrWhiteSpace(returnUrl))
            return "/";
        if (!returnUrl.StartsWith('/') || returnUrl.StartsWith("//") || returnUrl.Contains('\\'))
            return "/";
        return returnUrl;
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        var a = System.Text.Encoding.UTF8.GetBytes(left);
        var b = System.Text.Encoding.UTF8.GetBytes(right);
        return a.Length == b.Length && System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(a, b);
    }

    private void ClearOAuthStateCookie()
    {
        Response.Cookies.Delete(OAuthStateCookie, new CookieOptions
        {
            HttpOnly = true,
            Secure = !_environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path = "/api/auth/external"
        });
    }

    private void ClearOAuthPendingCookie()
    {
        Response.Cookies.Delete(OAuthPendingCookie, new CookieOptions
        {
            HttpOnly = true,
            Secure = !_environment.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
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

    private sealed record OAuthStatePayload(
        AuthMethod Provider,
        string State,
        string CodeVerifier,
        string ReturnUrl);
}

public record DiaryLoginRequestDto(
    string Login,
    string PasswordHash
);
