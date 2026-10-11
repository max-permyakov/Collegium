using System.Net;
using System.Net.Http.Headers;
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
        
        _client = _factory.CreateClient();
        _configuration = _factory.Services.GetRequiredService<IConfiguration>();
    }

    private async Task<HttpResponseMessage> SkipIfDiaryUnavailable(HttpResponseMessage response, string testName)
    {
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            var errorContent = await response.Content.ReadAsStringAsync();
            // Use Assert.True with false to effectively skip the test with a message
            throw new InvalidOperationException($"SKIP: Diary API returned 401 Unauthorized in {testName}. Diary API may not be accessible or credentials are invalid. Response: {await response.Content.ReadAsStringAsync()}");
        }
        return response;
    }

    // The diary expects the SHA-256 (base64) hash of the password, not the raw password.
    private static string HashPassword(string password)
    {
        return Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));
    }

    [Fact]
    public async Task DiaryLogin_WithValidCredentials_ReturnsToken()
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
        await SkipIfDiaryUnavailable(response, "DiaryLogin_WithValidCredentials_ReturnsToken");
        
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var loginResponse = await response.Content.ReadFromJsonAsync<LoginResponseDto>();

        loginResponse.Should().NotBeNull();
        loginResponse!.AccessToken.Should().NotBeNullOrEmpty();
        loginResponse.RefreshToken.Should().NotBeNullOrEmpty();
        loginResponse.User.Should().NotBeNull();
        loginResponse.User.Role.Should().Be("Student");
        loginResponse.User.StudentProfile.Should().NotBeNull();
        loginResponse.User.StudentProfile!.ExternalStudentId.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task DiaryLogin_WithInvalidCredentials_ReturnsUnauthorized()
    {
        // Arrange
        var request = new DiaryLoginRequestDto("invalid_login", "invalid_password");

        // Act
        var response = await _client.PostAsJsonAsync("/api/auth/diary-login", request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task DiaryRelogin_WithValidSession_ReturnsNewToken()
    {
        // Arrange - First login to establish session
        var login = _configuration["Diary:TestLogin"];
        var password = _configuration["Diary:TestPassword"];
        
        if (string.IsNullOrEmpty(login) || string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException("SKIP: Diary test credentials not configured in user secrets");
        }
        
        var initialRequest = new DiaryLoginRequestDto(login!, HashPassword(password!));

        var initialResponse = await _client.PostAsJsonAsync("/api/auth/diary-login", initialRequest);
        
        await SkipIfDiaryUnavailable(initialResponse, "DiaryRelogin_WithValidSession_ReturnsNewToken");
        
        initialResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var initialLoginResponse = await initialResponse.Content.ReadFromJsonAsync<LoginResponseDto>();

        initialLoginResponse.Should().NotBeNull();
        initialLoginResponse!.AccessToken.Should().NotBeNullOrEmpty();

        // Set authorization header
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", initialLoginResponse.AccessToken);

        // Act - Call relogin
        var reloginResponse = await _client.PostAsync("/api/auth/diary-relogin", null);

        // Assert
        reloginResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var reloginResponseDto = await reloginResponse.Content.ReadFromJsonAsync<LoginResponseDto>();

        reloginResponseDto.Should().NotBeNull();
        reloginResponseDto!.AccessToken.Should().NotBeNullOrEmpty();
        reloginResponseDto.AccessToken.Should().NotBe(initialLoginResponse.AccessToken); // Should be a new token
    }
}

public record DiaryLoginRequestDto(
    string Login,
    string PasswordHash
);

public record LoginResponseDto(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User
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