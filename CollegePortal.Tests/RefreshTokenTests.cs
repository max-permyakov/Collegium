using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CollegePortal.Application.DTOs;
using CollegePortal.Domain.Entities;
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

// Unit tests for the refresh-token session flow (AuthService.RefreshSessionAsync
// and friends) against the in-memory provider; no external diary API involved.
public class RefreshTokenTests : IDisposable
{
    private readonly ServiceProvider _provider;
    private readonly IServiceScope _scope;
    private readonly CollegePortalDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AuthService _authService;

    public RefreshTokenTests()
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
            sp.GetRequiredService<IDataProtectionProvider>(),
            NullLogger<AuthService>.Instance));

        _provider = services.BuildServiceProvider();
        // SignInManager.SignOutAsync requires an HttpContext with request services.
        httpContextAccessor.HttpContext = new DefaultHttpContext { RequestServices = _provider };
        _scope = _provider.CreateScope();
        _dbContext = _scope.ServiceProvider.GetRequiredService<CollegePortalDbContext>();
        _userManager = _scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        _authService = _scope.ServiceProvider.GetRequiredService<AuthService>();
    }

    public void Dispose()
    {
        _scope.Dispose();
        _provider.Dispose();
        _dbContext.Dispose();
    }

    [Fact]
    public async Task Refresh_WithValidToken_RotatesTokenAndReturnsNewPair()
    {
        var (user, rawToken) = await SeedSessionAsync();

        var result = await _authService.RefreshSessionAsync(rawToken);

        result.Should().NotBeNull();
        result!.User.Id.Should().Be(user.Id);
        result.AccessToken.Should().NotBeNullOrEmpty();
        result.RefreshToken.Should().NotBeNullOrEmpty();
        result.RefreshToken.Should().NotBe(rawToken);

        var oldRow = await _dbContext.RefreshTokens.SingleAsync(t => t.TokenHash == Hash(rawToken));
        oldRow.RevokedAt.Should().NotBeNull("the presented token must be revoked on rotation");

        var newRow = await _dbContext.RefreshTokens.SingleAsync(t => t.TokenHash == Hash(result.RefreshToken));
        newRow.RevokedAt.Should().BeNull();
        newRow.UserId.Should().Be(user.Id);
        newRow.ExpiresAt.Should().BeAfter(DateTime.UtcNow.AddDays(29));
    }

    [Fact]
    public async Task Refresh_WithRotatedToken_Succeeds_SlidingSession()
    {
        var (_, rawToken) = await SeedSessionAsync();

        var first = await _authService.RefreshSessionAsync(rawToken);
        first.Should().NotBeNull();

        var second = await _authService.RefreshSessionAsync(first!.RefreshToken);

        second.Should().NotBeNull();
        second!.RefreshToken.Should().NotBe(first.RefreshToken);
    }

    [Fact]
    public async Task Refresh_AccessTokenContainsUserAndStampClaims()
    {
        var (user, rawToken) = await SeedSessionAsync();

        var result = await _authService.RefreshSessionAsync(rawToken);

        result.Should().NotBeNull();

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(result!.AccessToken);
        jwt.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value.Should().Be(user.Id.ToString());
        jwt.Claims.First(c => c.Type == "sstamp").Value.Should().Be(user.SecurityStamp);
        jwt.ValidTo.Should().BeAfter(DateTime.UtcNow.AddMinutes(14));
    }

    [Fact]
    public async Task Refresh_WithUnknownToken_ReturnsNull()
    {
        await SeedSessionAsync();

        var result = await _authService.RefreshSessionAsync(GenerateRawToken());

        result.Should().BeNull();
    }

    [Fact]
    public async Task Refresh_WithRevokedToken_ReturnsNull()
    {
        var (user, rawToken) = await SeedSessionAsync();
        await _authService.LogoutAsync(user.Id, rawToken);

        var result = await _authService.RefreshSessionAsync(rawToken);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Refresh_WithExpiredToken_ReturnsNull()
    {
        var (user, _) = await SeedSessionAsync();
        var expiredRaw = GenerateRawToken();
        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = Hash(expiredRaw),
            CreatedAt = DateTime.UtcNow.AddDays(-31),
            ExpiresAt = DateTime.UtcNow.AddMinutes(-1)
        });
        await _dbContext.SaveChangesAsync();

        var result = await _authService.RefreshSessionAsync(expiredRaw);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Refresh_WithDisabledUser_ReturnsNullAndRevokesToken()
    {
        var (user, rawToken) = await SeedSessionAsync(isActive: false);

        var result = await _authService.RefreshSessionAsync(rawToken);

        result.Should().BeNull();
        var row = await _dbContext.RefreshTokens.SingleAsync(t => t.TokenHash == Hash(rawToken));
        row.RevokedAt.Should().NotBeNull("a dangling credential of a disabled account must be revoked");
    }

    [Fact]
    public async Task Logout_RevokesOnlyPresentedToken_OtherSessionsSurvive()
    {
        var (user, rawTokenA) = await SeedSessionAsync();
        var rawTokenB = GenerateRawToken();
        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = Hash(rawTokenB),
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        });
        await _dbContext.SaveChangesAsync();

        await _authService.LogoutAsync(user.Id, rawTokenA);

        var rowA = await _dbContext.RefreshTokens.SingleAsync(t => t.TokenHash == Hash(rawTokenA));
        var rowB = await _dbContext.RefreshTokens.SingleAsync(t => t.TokenHash == Hash(rawTokenB));
        rowA.RevokedAt.Should().NotBeNull();
        rowB.RevokedAt.Should().BeNull("logging out of one device must not kill other sessions");
    }

    [Fact]
    public async Task RevokeAll_RevokesEverySessionOfTheUser()
    {
        var (user, rawTokenA) = await SeedSessionAsync();
        var rawTokenB = GenerateRawToken();
        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = Hash(rawTokenB),
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        });
        await _dbContext.SaveChangesAsync();

        await _authService.RevokeAllRefreshTokensAsync(user.Id);

        var rows = await _dbContext.RefreshTokens.Where(t => t.UserId == user.Id).ToListAsync();
        rows.Should().HaveCount(2);
        rows.Should().OnlyContain(t => t.RevokedAt != null);
    }

    private async Task<(ApplicationUser User, string RawToken)> SeedSessionAsync(bool isActive = true)
    {
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = $"user{Guid.NewGuid():N}"[..24],
            Email = $"user{Guid.NewGuid():N}@test.local",
            DisplayName = "Test User",
            Role = "Student",
            IsActive = isActive,
            EmailConfirmed = true
        };

        var createResult = await _userManager.CreateAsync(user, "Password1!");
        createResult.Succeeded.Should().BeTrue(
            string.Join("; ", createResult.Errors.Select(e => e.Description)));

        // Reload to pick up the generated SecurityStamp.
        user = await _userManager.FindByIdAsync(user.Id.ToString()) ?? user;

        var rawToken = GenerateRawToken();
        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = Hash(rawToken),
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        });
        await _dbContext.SaveChangesAsync();

        return (user, rawToken);
    }

    private static string GenerateRawToken()
    {
        var bytes = new byte[64];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes);
    }

    // Mirrors AuthService.HashRefreshToken (SHA-256 as uppercase hex).
    private static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

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
}
