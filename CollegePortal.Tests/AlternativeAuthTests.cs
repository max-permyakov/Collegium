using System.Security.Cryptography;
using System.Text;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.Services;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CollegePortal.Tests;

public class AlternativeAuthTests : IDisposable
{
    private readonly ServiceProvider _provider;
    private readonly IServiceScope _scope;
    private readonly CollegePortalDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly StubEmailSender _emailSender = new();
    private readonly AuthService _authService;

    public AlternativeAuthTests()
    {
        var databaseName = Guid.NewGuid().ToString();

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = new string('k', 64),
                ["Jwt:Issuer"] = "CollegePortal",
                ["Jwt:Audience"] = "CollegePortalClient",
                ["Auth:AccessTokenMinutes"] = "15",
                ["Auth:RefreshTokenDays"] = "30"
            })
            .Build();

        var httpContextAccessor = new HttpContextAccessor();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddEntityFrameworkInMemoryDatabase();
        services.AddDbContext<CollegePortalDbContext>(options =>
            options.UseInMemoryDatabase(databaseName));
        services.AddIdentity<ApplicationUser, IdentityRole<Guid>>()
            .AddEntityFrameworkStores<CollegePortalDbContext>()
            .AddDefaultTokenProviders();
        services.AddSingleton<IHttpContextAccessor>(httpContextAccessor);
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSingleton<IDataProtectionProvider, StubDataProtectionProvider>();
        services.AddScoped(sp => new AuthService(
            sp.GetRequiredService<UserManager<ApplicationUser>>(),
            sp.GetRequiredService<SignInManager<ApplicationUser>>(),
            sp.GetRequiredService<CollegePortalDbContext>(),
            configuration,
            null!,
            _emailSender,
            null!,
            null!,
            sp.GetRequiredService<IDataProtectionProvider>(),
            NullLogger<AuthService>.Instance));

        _provider = services.BuildServiceProvider();
        _scope = _provider.CreateScope();
        _dbContext = _scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();
        _userManager = _scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        _authService = _scope.ServiceProvider.GetRequiredService<AuthService>();
        _dbContext.Database.EnsureCreated();

        var roleManager = _scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        if (!roleManager.RoleExistsAsync("Student").GetAwaiter().GetResult())
            roleManager.CreateAsync(new IdentityRole<Guid>("Student")).GetAwaiter().GetResult();
    }

    [Fact]
    public async Task RequestCode_StoresOnlyHashAndSendsSixDigitCode()
    {
        var result = await _authService.RequestEmailCodeAsync("Student@Example.com", null);

        result.Sent.Should().BeTrue();
        result.RetryAfterSeconds.Should().Be(60);
        _emailSender.LastCode.Should().MatchRegex("^[0-9]{6}$");
        _emailSender.LastEmail.Should().Be("student@example.com");

        var row = await _dbContext.EmailLoginCodes.SingleAsync();
        row.Email.Should().Be("student@example.com");
        row.CodeHash.Should().HaveLength(64).And.NotBe(_emailSender.LastCode);
        row.ConsumedAt.Should().BeNull();
    }

    [Fact]
    public async Task RequestCode_ThrottlesSecondRequestWithinCooldown()
    {
        await _authService.RequestEmailCodeAsync("student@example.com", null);

        var result = await _authService.RequestEmailCodeAsync("student@example.com", null);

        result.Sent.Should().BeTrue();
        result.RetryAfterSeconds.Should().BeGreaterThan(0).And.BeLessThanOrEqualTo(60);
        (await _dbContext.EmailLoginCodes.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task VerifyCode_WithWrongCodeIncrementsAttemptsWithoutConsuming()
    {
        await _authService.RequestEmailCodeAsync("student@example.com", null);

        var result = await _authService.VerifyEmailCodeAsync("student@example.com", "000000");

        result.Success.Should().BeFalse();
        var row = await _dbContext.EmailLoginCodes.SingleAsync();
        row.Attempts.Should().Be(1);
        row.ConsumedAt.Should().BeNull();
    }

    [Fact]
    public async Task VerifyCode_ForUnknownEmailReturnsRegistrationTokenWithoutCreatingUser()
    {
        await _authService.RequestEmailCodeAsync("new@example.com", null);

        var result = await _authService.VerifyEmailCodeAsync("new@example.com", _emailSender.LastCode!);

        result.Success.Should().BeTrue();
        result.RequiresRegistration.Should().BeTrue();
        result.RegistrationToken.Should().NotBeNullOrWhiteSpace();
        result.User.Should().BeNull();
        (await _userManager.FindByEmailAsync("new@example.com")).Should().BeNull();

        var row = await _dbContext.EmailLoginCodes.SingleAsync();
        row.RegistrationTokenHash.Should().Be(
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(result.RegistrationToken!))));
        row.RegistrationTokenExpiresAt.Should().BeAfter(DateTime.UtcNow);
    }

    [Fact]
    public async Task VerifyCode_ForExistingUserIssuesSessionAndLinksEmailProvider()
    {
        var user = new ApplicationUser
        {
            UserName = "linked@example.com",
            Email = "linked@example.com",
            DisplayName = "Linked Student",
            Role = "Student",
            IsActive = true,
            EmailConfirmed = true
        };
        var created = await _userManager.CreateAsync(user, "Password1!");
        created.Succeeded.Should().BeTrue();

        await _authService.RequestEmailCodeAsync("linked@example.com", null);
        var result = await _authService.VerifyEmailCodeAsync("linked@example.com", _emailSender.LastCode!);

        result.Success.Should().BeTrue();
        result.Session.Should().NotBeNull();
        result.Session!.AccessToken.Should().NotBeNullOrWhiteSpace();
        (await _dbContext.UserAuthProviders.SingleAsync()).Provider.Should().Be(AuthMethod.Email);
        (await _userManager.FindByEmailAsync("linked@example.com"))!.LastAuthMethod.Should().Be(AuthMethod.Email);
    }

    [Fact]
    public async Task ExternalLogin_UnverifiedEmailReturnsPendingTokenAndCodeCarriesProvider()
    {
        var identity = new ExternalIdentity(AuthMethod.Vk, "vk-42", null, false, "VK Student");

        var external = await _authService.ExternalLoginAsync(identity);

        external.RequiresEmail.Should().BeTrue();
        external.PendingOAuthToken.Should().NotBeNullOrWhiteSpace();
        external.Session.Should().BeNull();

        var requested = await _authService.RequestEmailCodeAsync("vk@example.com", external.PendingOAuthToken);
        requested.Sent.Should().BeTrue();

        var row = await _dbContext.EmailLoginCodes.SingleAsync();
        row.OAuthProvider.Should().Be(AuthMethod.Vk);
        row.OAuthProviderUserId.Should().Be("vk-42");
    }

    [Fact]
    public async Task ExternalLogin_VerifiedNewEmailCreatesAccountRequiringProfileSetup()
    {
        var identity = new ExternalIdentity(AuthMethod.Google, "google-7", "New@Example.com", true, "New Student");

        var result = await _authService.ExternalLoginAsync(identity);

        result.RequiresEmail.Should().BeFalse();
        result.Session.Should().NotBeNull();
        result.Session!.User.RequiresProfileSetup.Should().BeTrue();
        result.Session.User.RegistrationSource.Should().Be(AuthMethod.Google);
        result.Session.User.Email.Should().Be("new@example.com");
        (await _dbContext.UserAuthProviders.SingleAsync()).ProviderUserId.Should().Be("google-7");
    }

    private sealed class StubEmailSender : IEmailSender
    {
        public bool IsConfigured => true;
        public string? LastEmail { get; private set; }
        public string? LastCode { get; private set; }

        public Task SendLoginCodeAsync(string email, string code, TimeSpan lifetime, CancellationToken ct = default)
        {
            LastEmail = email;
            LastCode = code;
            return Task.CompletedTask;
        }
    }

    private sealed class StubDataProtectionProvider : IDataProtectionProvider
    {
        public IDataProtector CreateProtector(string purpose) => new StubDataProtector();
    }

    private sealed class StubDataProtector : IDataProtector
    {
        public byte[] Protect(byte[] plaintext) => plaintext;
        public byte[] Unprotect(byte[] protectedData) => protectedData;
        public IEnumerable<string> GetAllPurposes() => [];
        public IDataProtector CreateProtector(string purpose) => this;
    }

    public void Dispose()
    {
        _scope.Dispose();
        _provider.Dispose();
    }
}
