using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using CollegePortal.Api;
using FluentAssertions;
using Xunit;

namespace CollegePortal.Tests;

public class AuthIntegrationTests : IClassFixture<WebApplicationFactory<CollegePortal.Api.Program>>
{
    private readonly WebApplicationFactory<CollegePortal.Api.Program> _factory;
    private readonly HttpClient _client;
    private readonly IConfiguration _configuration;

    public AuthIntegrationTests(WebApplicationFactory<CollegePortal.Api.Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((context, config) =>
            {
                config.AddUserSecrets<CollegePortal.Api.Program>();
            });
        });

        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        _configuration = _factory.Services.GetRequiredService<IConfiguration>();
    }

    private async Task SkipIfDiaryUnavailable(HttpResponseMessage response, string testName)
    {
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            throw new InvalidOperationException($"SKIP: Diary API returned 401 Unauthorized in {testName}. Diary API may not be accessible or credentials are invalid. Response: {await response.Content.ReadAsStringAsync()}");
        }
        return;
    }

    private static string HashPassword(string password) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));

    private static bool HasAuthCookie(HttpResponseMessage response)
    {
        return response.Headers.TryGetValues("Set-Cookie", out var cookies)
            && cookies.Any(c => c.StartsWith("cp_access=", StringComparison.Ordinal));
    }

    private static bool HasRefreshCookie(HttpResponseMessage response)
    {
        return response.Headers.TryGetValues("Set-Cookie", out var cookies)
            && cookies.Any(c => c.StartsWith("cp_refresh=", StringComparison.Ordinal));
    }

    [Fact]
    public async Task DiaryLogin_WithValidCredentials_SetsAuthCookie()
    {
        // Arrange
        var login = _configuration["Diary:TestLogin"];
        var password = _configuration["Diary:TestPassword"];

        login.Should().NotBeNullOrEmpty("Test login should be configured in user secrets");
        password.Should().NotBeNullOrEmpty("Test password should be configured in user secrets");

        var request = new DiaryLoginRequestDto(login!, HashPassword(password!));

        // Act
        var response = await _client.PostAsJsonAsync("/api/auth/diary-login", request);

        // Assert - Handle diary API unavailability gracefully
        await SkipIfDiaryUnavailable(response, "DiaryLogin_WithValidCredentials_SetsAuthCookie");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        HasAuthCookie(response).Should().BeTrue();
        HasRefreshCookie(response).Should().BeTrue("login must set both the access and the refresh cookie");

        var user = await response.Content.ReadFromJsonAsync<UserDto>();

        user.Should().NotBeNull();
        user!.Role.Should().BeOneOf("Student", "Admin");

        if (user.Role == "Student")
        {
            user.StudentProfile.Should().NotBeNull();
            user.StudentProfile!.ExternalStudentId.Should().BeGreaterThan(0);
        }
    }

    [Fact]
    public async Task DiaryLogin_WithInvalidCredentials_ReturnsUnauthorized()
    {
        // Arrange
        var request = new DiaryLoginRequestDto("invalid_login", HashPassword("invalid_password"));

        // Act
        var response = await _client.PostAsJsonAsync("/api/auth/diary-login", request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        HasAuthCookie(response).Should().BeFalse();
    }

    [Fact]
    public async Task DiaryRelogin_WithValidSession_ReturnsOkWithCookie()
    {
        // Arrange - First login to establish the session cookie
        var login = _configuration["Diary:TestLogin"];
        var password = _configuration["Diary:TestPassword"];

        if (string.IsNullOrEmpty(login) || string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException("SKIP: Diary test credentials not configured in user secrets");
        }

        var initialRequest = new DiaryLoginRequestDto(login!, HashPassword(password!));
        var initialResponse = await _client.PostAsJsonAsync("/api/auth/diary-login", initialRequest);

        await SkipIfDiaryUnavailable(initialResponse, "DiaryRelogin_WithValidSession_ReturnsOkWithCookie");

        initialResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        HasAuthCookie(initialResponse).Should().BeTrue();

        // Act - Call relogin (cookie is sent automatically)
        var reloginResponse = await _client.PostAsync("/api/auth/diary-relogin", null);

        // Assert
        reloginResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        HasAuthCookie(reloginResponse).Should().BeTrue();
    }

    [Fact]
    public async Task Refresh_WithValidSession_RotatesCookies()
    {
        // Arrange - First login to establish the session cookies
        var login = _configuration["Diary:TestLogin"];
        var password = _configuration["Diary:TestPassword"];

        if (string.IsNullOrEmpty(login) || string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException("SKIP: Diary test credentials not configured in user secrets");
        }

        var initialRequest = new DiaryLoginRequestDto(login!, HashPassword(password!));
        var initialResponse = await _client.PostAsJsonAsync("/api/auth/diary-login", initialRequest);

        await SkipIfDiaryUnavailable(initialResponse, "Refresh_WithValidSession_RotatesCookies");

        initialResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        HasAuthCookie(initialResponse).Should().BeTrue();
        HasRefreshCookie(initialResponse).Should().BeTrue();

        // Act - Exchange the refresh cookie for a fresh pair (sent automatically)
        var refreshResponse = await _client.PostAsync("/api/auth/refresh", null);

        // Assert
        refreshResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        HasAuthCookie(refreshResponse).Should().BeTrue();
        HasRefreshCookie(refreshResponse).Should().BeTrue();

        // The rotated session must be usable: /me responds with the user.
        var meResponse = await _client.GetAsync("/api/auth/me");
        meResponse.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Refresh_WithoutCookies_ReturnsUnauthorized()
    {
        // A cookie-less client (fresh browser) must not be able to refresh.
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var refreshResponse = await client.PostAsync("/api/auth/refresh", null);

        refreshResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}

public record DiaryLoginRequestDto(
    string Login,
    string PasswordHash
);

public record UserDto(
    Guid Id,
    string Email,
    string DisplayName,
    string Role,
    bool IsActive,
    StudentProfileDto? StudentProfile
);

public record StudentProfileDto(
    Guid Id,
    Guid StudyGroupId,
    string StudyGroupName,
    int ExternalStudentId
);
