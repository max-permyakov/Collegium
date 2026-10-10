using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace CollegePortal.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly CollegePortalDbContext _dbContext;
    private readonly IConfiguration _configuration;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        CollegePortalDbContext dbContext,
        IConfiguration configuration)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _dbContext = dbContext;
        _configuration = configuration;
    }

    public async Task<LoginResponseDto?> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var user = await _userManager.FindByEmailAsync(email);
        if (user == null || !user.IsActive)
            return null;

        var result = await _signInManager.CheckPasswordSignInAsync(user, password, false);
        if (!result.Succeeded)
            return null;

        user.LastLoginAt = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var token = GenerateJwtToken(user, roles);
        var refreshToken = GenerateRefreshToken();
        var expiresAt = DateTime.UtcNow.AddHours(1);

        user.SecurityStamp = Guid.NewGuid().ToString();
        await _userManager.UpdateAsync(user);

        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        var userDto = new UserDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName,
            roles.FirstOrDefault() ?? "Student",
            user.IsActive,
            studentProfile != null ? new StudentProfileDto(
                studentProfile.Id,
                studentProfile.StudyGroupId,
                studentProfile.StudyGroup?.Name ?? "",
                studentProfile.ExternalStudentId
            ) : null
        );

        return new LoginResponseDto(token, refreshToken, expiresAt, userDto);
    }

    public async Task LogoutAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user != null)
        {
            user.SecurityStamp = Guid.NewGuid().ToString();
            await _userManager.UpdateAsync(user);
        }
        await _signInManager.SignOutAsync();
    }

    public async Task<UserDto?> GetCurrentUserAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null || !user.IsActive)
            return null;

        var roles = await _userManager.GetRolesAsync(user);
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        return new UserDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName,
            roles.FirstOrDefault() ?? "Student",
            user.IsActive,
            studentProfile != null ? new StudentProfileDto(
                studentProfile.Id,
                studentProfile.StudyGroupId,
                studentProfile.StudyGroup?.Name ?? "",
                studentProfile.ExternalStudentId
            ) : null
        );
    }

    public async Task<LoginResponseDto?> RegisterAsync(string email, string password, string displayName, string role, CancellationToken ct = default)
    {
        var existingUser = await _userManager.FindByEmailAsync(email);
        if (existingUser != null)
            return null;

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            DisplayName = displayName,
            Role = role,
            IsActive = true,
            EmailConfirmed = true
        };

        var result = await _userManager.CreateAsync(user, password);
        if (!result.Succeeded)
            return null;

        await _userManager.AddToRoleAsync(user, role);

        var roles = new[] { role };
        var token = GenerateJwtToken(user, roles);
        var refreshToken = GenerateRefreshToken();
        var expiresAt = DateTime.UtcNow.AddHours(1);

        return new LoginResponseDto(token, refreshToken, expiresAt, new UserDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName,
            role,
            user.IsActive,
            null
        ));
    }

    public async Task<bool> AssignStudentProfileAsync(Guid userId, int externalStudentId, Guid studyGroupId, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null)
            return false;

        var existingProfile = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(sp => sp.UserId == userId || sp.ExternalStudentId == externalStudentId, ct);
        if (existingProfile != null)
            return false;

        var studyGroup = await _dbContext.StudyGroups.FindAsync(studyGroupId, ct);
        if (studyGroup == null)
            return false;

        var profile = new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            StudyGroupId = studyGroupId,
            ExternalStudentId = externalStudentId,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.StudentProfiles.Add(profile);
        await _dbContext.SaveChangesAsync(ct);
        return true;
    }

    private string GenerateJwtToken(ApplicationUser user, IList<string> roles)
    {
        var jwtKey = _configuration["Jwt:Key"] ?? "super-secret-key-change-in-production-min-32-chars";
        var jwtIssuer = _configuration["Jwt:Issuer"] ?? "CollegePortal";
        var jwtAudience = _configuration["Jwt:Audience"] ?? "CollegePortalClient";

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email ?? ""),
            new(ClaimTypes.Name, user.DisplayName),
            new("role", user.Role)
        };

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private string GenerateRefreshToken()
    {
        return Convert.ToBase64String(Guid.NewGuid().ToByteArray()) + Convert.ToBase64String(Guid.NewGuid().ToByteArray());
    }
}