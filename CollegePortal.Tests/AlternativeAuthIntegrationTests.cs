using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Api;
using AuthUserDto = CollegePortal.Application.DTOs.UserDto;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace CollegePortal.Tests;

public class AlternativeAuthIntegrationTests : IAsyncLifetime
{
    private readonly CaptureEmailSender _emailSender = new();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public Task InitializeAsync()
    {
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Auth:OtpPepper"] = new string('p', 64)
                    });
                });
                builder.ConfigureTestServices(services =>
                {
                    services.AddSingleton<IEmailSender>(_emailSender);
                    services.RemoveAll<ICollegeInfoService>();
                    services.AddSingleton<ICollegeInfoService>(new StubCollegeInfoService());
                });
            });

        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Providers_ReportsEmailWhenSenderConfigured()
    {
        var response = await _client.GetAsync("/api/auth/providers");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var providers = await response.Content.ReadFromJsonAsync<AuthProvidersDto>(JsonOptions);
        providers.Should().NotBeNull();
        providers!.EmailEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task EmailCode_ForUnknownEmail_ReturnsRegistrationToken()
    {
        var email = $"new-{Guid.NewGuid():N}@example.com";

        var request = await _client.PostAsJsonAsync("/api/auth/email/request-code",
            new RequestEmailCodeRequestDto(email));
        request.StatusCode.Should().Be(HttpStatusCode.OK);
        _emailSender.LastCode.Should().MatchRegex("^[0-9]{6}$");

        var verify = await _client.PostAsJsonAsync("/api/auth/email/verify-code",
            new VerifyEmailCodeRequestDto(email, _emailSender.LastCode!));
        verify.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await verify.Content.ReadFromJsonAsync<EmailVerifyResultDto>();
        result.Should().NotBeNull();
        result!.Success.Should().BeTrue();
        result.RequiresRegistration.Should().BeTrue();
        result.RegistrationToken.Should().NotBeNullOrWhiteSpace();
        result.Session.Should().BeNull();
    }

    [Fact]
    public async Task EmailCode_CompleteRegistration_CreatesStudentWithoutDiaryLink()
    {
        var email = $"student-{Guid.NewGuid():N}@example.com";

        var requested = await _client.PostAsJsonAsync("/api/auth/email/request-code",
            new RequestEmailCodeRequestDto(email));
        requested.StatusCode.Should().Be(HttpStatusCode.OK);
        _emailSender.LastCode.Should().NotBeNullOrWhiteSpace();

        var token = await VerifyAndGetRegistrationTokenAsync(email, _emailSender.LastCode!);

        var completed = await _client.PostAsJsonAsync("/api/auth/email/complete-registration",
            new CompleteEmailRegistrationRequestDto(token, "Тестов", "Студент", null, "TEST-GROUP"));
        completed.StatusCode.Should().Be(HttpStatusCode.OK);

        var me = await _client.GetFromJsonAsync<AuthUserDto>("/api/auth/me", JsonOptions);
        me.Should().NotBeNull();
        me!.Email.Should().Be(email);
        me.RequiresProfileSetup.Should().BeFalse();
        me.HasDiaryLink.Should().BeFalse();
        me.RegistrationSource.Should().Be(AuthMethod.Email);
        me.AuthProviders.Should().Contain(AuthMethod.Email);

        foreach (var path in new[] { "/api/grades", "/api/grades/performance", "/api/rating/group" })
        {
            var response = await _client.GetAsync(path);
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            body.RootElement.GetProperty("code").GetString().Should().Be("diary_required");
        }
    }

    [Fact]
    public async Task EmailCode_WithProviderOwnedByAnotherUser_ReturnsConflict()
    {
        var email = $"victim-{Guid.NewGuid():N}@example.com";
        var providerUserId = $"vk-{Guid.NewGuid():N}";

        using var scope = _factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var dbContext = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();

        var owner = CreateUser($"owner-{Guid.NewGuid():N}@example.com");
        var victim = CreateUser(email);
        (await userManager.CreateAsync(owner)).Succeeded.Should().BeTrue();
        (await userManager.CreateAsync(victim)).Succeeded.Should().BeTrue();

        dbContext.UserAuthProviders.Add(new UserAuthProvider
        {
            Id = Guid.NewGuid(),
            UserId = owner.Id,
            Provider = AuthMethod.Vk,
            ProviderUserId = providerUserId,
            ProviderEmail = owner.Email,
            CreatedAt = DateTime.UtcNow
        });
        dbContext.EmailLoginCodes.Add(new EmailLoginCode
        {
            Id = Guid.NewGuid(),
            Email = email,
            CodeHash = HashCode(email, "123456"),
            ExpiresAt = DateTime.UtcNow.AddMinutes(5),
            CreatedAt = DateTime.UtcNow,
            OAuthProvider = AuthMethod.Vk,
            OAuthProviderUserId = providerUserId
        });
        await dbContext.SaveChangesAsync();

        var verify = await _client.PostAsJsonAsync("/api/auth/email/verify-code",
            new VerifyEmailCodeRequestDto(email, "123456"));

        verify.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var result = await verify.Content.ReadFromJsonAsync<EmailVerifyResultDto>();
        result.Should().NotBeNull();
        result!.Success.Should().BeFalse();
        result.Conflict.Should().BeTrue();
    }

    [Fact]
    public async Task EmailCode_CompleteRegistration_WithProviderOwnedByAnotherUser_ReturnsConflict()
    {
        var email = $"race-{Guid.NewGuid():N}@example.com";
        var providerUserId = $"vk-{Guid.NewGuid():N}";

        var requested = await _client.PostAsJsonAsync("/api/auth/email/request-code",
            new RequestEmailCodeRequestDto(email));
        requested.StatusCode.Should().Be(HttpStatusCode.OK);
        var token = await VerifyAndGetRegistrationTokenAsync(email, _emailSender.LastCode!);

        using var scope = _factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var dbContext = scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();

        var owner = CreateUser($"owner-{Guid.NewGuid():N}@example.com");
        (await userManager.CreateAsync(owner)).Succeeded.Should().BeTrue();

        dbContext.UserAuthProviders.Add(new UserAuthProvider
        {
            Id = Guid.NewGuid(),
            UserId = owner.Id,
            Provider = AuthMethod.Vk,
            ProviderUserId = providerUserId,
            ProviderEmail = owner.Email,
            CreatedAt = DateTime.UtcNow
        });

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
        var row = dbContext.EmailLoginCodes.Single(c => c.RegistrationTokenHash == tokenHash);
        row.OAuthProvider = AuthMethod.Vk;
        row.OAuthProviderUserId = providerUserId;
        await dbContext.SaveChangesAsync();

        var completed = await _client.PostAsJsonAsync("/api/auth/email/complete-registration",
            new CompleteEmailRegistrationRequestDto(token, "Тестов", "Студент", null, "TEST-GROUP"));

        completed.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    private async Task<string> VerifyAndGetRegistrationTokenAsync(string email, string code)
    {
        var verify = await _client.PostAsJsonAsync("/api/auth/email/verify-code",
            new VerifyEmailCodeRequestDto(email, code));
        verify.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await verify.Content.ReadFromJsonAsync<EmailVerifyResultDto>(JsonOptions);
        result.Should().NotBeNull();
        result!.RequiresRegistration.Should().BeTrue();
        result.RegistrationToken.Should().NotBeNullOrWhiteSpace();
        return result.RegistrationToken!;
    }

    private static ApplicationUser CreateUser(string email) => new()
    {
        UserName = email,
        Email = email,
        DisplayName = "Conflict Test",
        Role = "Student",
        IsActive = true,
        EmailConfirmed = true
    };

    private static string HashCode(string email, string code)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(new string('p', 64)));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{email}:{code}")));
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private sealed class StubCollegeInfoService : ICollegeInfoService
    {
        public Task<CollegeCatalogDto?> GetCatalogAsync(CancellationToken ct = default) =>
            Task.FromResult<CollegeCatalogDto?>(new CollegeCatalogDto(["TEST-GROUP"], [], []));

        public Task<CollegeInfoActionResult> RefreshCatalogAsync(CancellationToken ct = default) =>
            Task.FromResult(new CollegeInfoActionResult(true));

        public Task<CollegeScheduleSearchDto?> SearchScheduleAsync(string type, string query, DateTime? date, CancellationToken ct = default) =>
            Task.FromResult<CollegeScheduleSearchDto?>(null);

        public Task<CollegeTeacherDto[]> GetTeachersAsync(CancellationToken ct = default) =>
            Task.FromResult(Array.Empty<CollegeTeacherDto>());

        public Task<CollegeInfoActionResult> RefreshTeachersAsync(Guid? adminUserId, CancellationToken ct = default) =>
            Task.FromResult(new CollegeInfoActionResult(true));
    }

    private sealed class CaptureEmailSender : IEmailSender
    {
        public bool IsConfigured => true;
        public string? LastCode { get; private set; }

        public Task SendLoginCodeAsync(string email, string code, TimeSpan lifetime, CancellationToken ct = default)
        {
            LastCode = code;
            return Task.CompletedTask;
        }
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        _factory.Dispose();
        return Task.CompletedTask;
    }
}
