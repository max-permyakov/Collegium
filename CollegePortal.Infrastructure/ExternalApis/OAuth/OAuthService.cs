using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Enums;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace CollegePortal.Infrastructure.ExternalApis.OAuth;

public class OAuthProviderOptions
{
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? AuthorizationEndpoint { get; set; }
    public string? TokenEndpoint { get; set; }
    public string? UserInfoEndpoint { get; set; }
    public string? EmailsEndpoint { get; set; }
    public string? Scopes { get; set; }
}

public class OAuthOptions
{
    public OAuthProviderOptions Google { get; set; } = new();
    public OAuthProviderOptions GitHub { get; set; } = new();
    public OAuthProviderOptions Yandex { get; set; } = new();
    public OAuthProviderOptions Vk { get; set; } = new();
}

public class OAuthService : IOAuthService
{
    private static readonly Dictionary<AuthMethod, string> Names = new()
    {
        [AuthMethod.Google] = "Google",
        [AuthMethod.GitHub] = "GitHub",
        [AuthMethod.Yandex] = "Яндекс",
        [AuthMethod.Vk] = "VK"
    };

    private readonly HttpClient _httpClient;
    private readonly OAuthOptions _options;
    private readonly ILogger<OAuthService> _logger;

    public OAuthService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<OAuthService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _options = configuration.GetSection("OAuth").Get<OAuthOptions>() ?? new OAuthOptions();
        ApplyDefaults(_options);
    }

    private static void ApplyDefaults(OAuthOptions options)
    {
        options.Google.AuthorizationEndpoint ??= "https://accounts.google.com/o/oauth2/v2/auth";
        options.Google.TokenEndpoint ??= "https://oauth2.googleapis.com/token";
        options.Google.UserInfoEndpoint ??= "https://openidconnect.googleapis.com/v1/userinfo";
        options.Google.Scopes ??= "openid email profile";

        options.GitHub.AuthorizationEndpoint ??= "https://github.com/login/oauth/authorize";
        options.GitHub.TokenEndpoint ??= "https://github.com/login/oauth/access_token";
        options.GitHub.UserInfoEndpoint ??= "https://api.github.com/user";
        options.GitHub.EmailsEndpoint ??= "https://api.github.com/user/emails";
        options.GitHub.Scopes ??= "read:user user:email";

        options.Yandex.AuthorizationEndpoint ??= "https://oauth.yandex.ru/authorize";
        options.Yandex.TokenEndpoint ??= "https://oauth.yandex.ru/token";
        options.Yandex.UserInfoEndpoint ??= "https://login.yandex.ru/info?format=json";
        options.Yandex.Scopes ??= "login:email login:info";

        options.Vk.AuthorizationEndpoint ??= "https://oauth.vk.com/authorize";
        options.Vk.TokenEndpoint ??= "https://oauth.vk.com/access_token";
        options.Vk.UserInfoEndpoint ??= "https://api.vk.com/method/users.get?v=5.199&fields=screen_name";
        options.Vk.Scopes ??= "email";
    }

    private OAuthProviderOptions OptionsFor(AuthMethod provider) => provider switch
    {
        AuthMethod.Google => _options.Google,
        AuthMethod.GitHub => _options.GitHub,
        AuthMethod.Yandex => _options.Yandex,
        AuthMethod.Vk => _options.Vk,
        _ => throw new ArgumentOutOfRangeException(nameof(provider))
    };

    public bool IsEnabled(AuthMethod provider)
    {
        if (provider is not (AuthMethod.Google or AuthMethod.GitHub or AuthMethod.Yandex or AuthMethod.Vk))
            return false;

        var options = OptionsFor(provider);
        return !string.IsNullOrWhiteSpace(options.ClientId) &&
               !string.IsNullOrWhiteSpace(options.ClientSecret);
    }

    public AuthProviderOptionDto[] GetProviders() =>
        new[] { AuthMethod.Google, AuthMethod.GitHub, AuthMethod.Yandex, AuthMethod.Vk }
            .Select(p => new AuthProviderOptionDto(p, Names[p], IsEnabled(p)))
            .ToArray();

    public OAuthAuthorizationRequest CreateAuthorizationRequest(AuthMethod provider, string redirectUri)
    {
        if (!IsEnabled(provider))
            throw new InvalidOperationException($"OAuth provider {provider} is not configured.");

        var options = OptionsFor(provider);
        var state = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        var verifier = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(48));
        var challenge = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));

        var parameters = new Dictionary<string, string?>
        {
            ["client_id"] = options.ClientId,
            ["redirect_uri"] = redirectUri,
            ["response_type"] = "code",
            ["state"] = state,
            ["scope"] = options.Scopes,
            ["code_challenge"] = challenge,
            ["code_challenge_method"] = "S256"
        };

        if (provider == AuthMethod.Google)
            parameters["access_type"] = "online";

        var query = string.Join("&", parameters
            .Where(p => !string.IsNullOrEmpty(p.Value))
            .Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value!)}"));

        return new OAuthAuthorizationRequest(
            $"{options.AuthorizationEndpoint}?{query}",
            state,
            verifier);
    }

    public async Task<ExternalIdentity?> ExchangeCodeAsync(
        AuthMethod provider,
        string code,
        string codeVerifier,
        string redirectUri,
        CancellationToken ct = default)
    {
        if (!IsEnabled(provider))
            return null;

        var options = OptionsFor(provider);
        var token = await ExchangeCodeForTokenAsync(provider, options, code, codeVerifier, redirectUri, ct);
        if (token == null)
            return null;

        return provider switch
        {
            AuthMethod.Google => await ReadGoogleAsync(token.Value.AccessToken, ct),
            AuthMethod.GitHub => await ReadGitHubAsync(token.Value.AccessToken, ct),
            AuthMethod.Yandex => await ReadYandexAsync(token.Value.AccessToken, ct),
            AuthMethod.Vk => ReadVk(token.Value, await GetVkProfileAsync(token.Value.AccessToken, ct)),
            _ => null
        };
    }

    private async Task<TokenResult?> ExchangeCodeForTokenAsync(
        AuthMethod provider,
        OAuthProviderOptions options,
        string code,
        string codeVerifier,
        string redirectUri,
        CancellationToken ct)
    {
        var form = new Dictionary<string, string>
        {
            ["client_id"] = options.ClientId!,
            ["client_secret"] = options.ClientSecret!,
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["grant_type"] = "authorization_code",
            ["code_verifier"] = codeVerifier
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, options.TokenEndpoint)
        {
            Content = new FormUrlEncodedContent(form)
        };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await _httpClient.SendAsync(request, ct);
        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("OAuth token exchange failed for {Provider}: {Status}", provider, response.StatusCode);
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("error", out var error))
            {
                _logger.LogWarning("OAuth provider {Provider} returned error {Error}", provider, error.ToString());
                return null;
            }

            var accessToken = root.TryGetProperty("access_token", out var at) ? at.GetString() : null;
            if (string.IsNullOrWhiteSpace(accessToken))
                return null;

            var email = root.TryGetProperty("email", out var em) ? em.GetString() : null;
            return new TokenResult(accessToken, email);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Invalid OAuth token response for {Provider}", provider);
            return null;
        }
    }

    private async Task<ExternalIdentity?> ReadGoogleAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, _options.Google.UserInfoEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            return null;

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var root = doc.RootElement;
        var id = root.TryGetProperty("sub", out var sub) ? sub.GetString() : null;
        var email = root.TryGetProperty("email", out var em) ? em.GetString() : null;
        var verified = root.TryGetProperty("email_verified", out var ev) &&
                       (ev.ValueKind == JsonValueKind.True || (ev.ValueKind == JsonValueKind.String && bool.TryParse(ev.GetString(), out var b) && b));
        var name = root.TryGetProperty("name", out var n) ? n.GetString() : null;

        return string.IsNullOrWhiteSpace(id)
            ? null
            : new ExternalIdentity(AuthMethod.Google, id, email, verified, name ?? email ?? "Студент");
    }

    private async Task<ExternalIdentity?> ReadGitHubAsync(string accessToken, CancellationToken ct)
    {
        using var userRequest = new HttpRequestMessage(HttpMethod.Get, _options.GitHub.UserInfoEndpoint);
        userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        userRequest.Headers.UserAgent.ParseAdd("CollegePortal");
        using var userResponse = await _httpClient.SendAsync(userRequest, ct);
        if (!userResponse.IsSuccessStatusCode)
            return null;

        using var userDoc = JsonDocument.Parse(await userResponse.Content.ReadAsStringAsync(ct));
        var root = userDoc.RootElement;
        var id = root.TryGetProperty("id", out var idEl) ? idEl.ToString() : null;
        var name = root.TryGetProperty("name", out var n) ? n.GetString() : null;
        if (string.IsNullOrWhiteSpace(name) && root.TryGetProperty("login", out var login))
            name = login.GetString();

        string? email = null;
        var verified = false;
        var emailsEndpoint = _options.GitHub.EmailsEndpoint;
        if (!string.IsNullOrWhiteSpace(emailsEndpoint))
        {
            using var emailsRequest = new HttpRequestMessage(HttpMethod.Get, emailsEndpoint);
            emailsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            emailsRequest.Headers.UserAgent.ParseAdd("CollegePortal");
            using var emailsResponse = await _httpClient.SendAsync(emailsRequest, ct);
            if (emailsResponse.IsSuccessStatusCode)
            {
                using var emailsDoc = JsonDocument.Parse(await emailsResponse.Content.ReadAsStringAsync(ct));
                if (emailsDoc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    var primary = emailsDoc.RootElement.EnumerateArray()
                        .FirstOrDefault(e =>
                            e.TryGetProperty("primary", out var p) && p.ValueKind == JsonValueKind.True &&
                            e.TryGetProperty("verified", out var v) && v.ValueKind == JsonValueKind.True);
                    if (primary.ValueKind == JsonValueKind.Object &&
                        primary.TryGetProperty("email", out var em))
                    {
                        email = em.GetString();
                        verified = true;
                    }
                }
            }
        }

        return string.IsNullOrWhiteSpace(id)
            ? null
            : new ExternalIdentity(AuthMethod.GitHub, id, email, verified, name ?? email ?? "Студент");
    }

    private async Task<ExternalIdentity?> ReadYandexAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, _options.Yandex.UserInfoEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("OAuth", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        using var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            return null;

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var root = doc.RootElement;
        var id = root.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
        var email = root.TryGetProperty("default_email", out var em) ? em.GetString() : null;
        var name = root.TryGetProperty("real_name", out var rn) ? rn.GetString() : null;
        if (string.IsNullOrWhiteSpace(name) && root.TryGetProperty("display_name", out var dn))
            name = dn.GetString();

        return string.IsNullOrWhiteSpace(id)
            ? null
            : new ExternalIdentity(AuthMethod.Yandex, id, email, !string.IsNullOrWhiteSpace(email), name ?? email ?? "Студент");
    }

    private async Task<JsonElement?> GetVkProfileAsync(string accessToken, CancellationToken ct)
    {
        using var response = await _httpClient.GetAsync(
            $"{_options.Vk.UserInfoEndpoint}&access_token={Uri.EscapeDataString(accessToken)}",
            ct);
        if (!response.IsSuccessStatusCode)
            return null;

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        if (!doc.RootElement.TryGetProperty("response", out var arr) ||
            arr.ValueKind != JsonValueKind.Array ||
            arr.GetArrayLength() == 0)
            return null;

        return arr[0].Clone();
    }

    private static ExternalIdentity? ReadVk(TokenResult token, JsonElement? profile)
    {
        if (profile is not { } p || !p.TryGetProperty("id", out var idEl))
            return null;

        var first = p.TryGetProperty("first_name", out var f) ? f.GetString() : null;
        var last = p.TryGetProperty("last_name", out var l) ? l.GetString() : null;
        var name = $"{last} {first}".Trim();
        var email = token.Email;
        return new ExternalIdentity(AuthMethod.Vk, idEl.ToString(), email, !string.IsNullOrWhiteSpace(email), string.IsNullOrWhiteSpace(name) ? "Студент" : name);
    }

    private readonly record struct TokenResult(string AccessToken, string? Email);
}
