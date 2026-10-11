using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using CollegePortal.Infrastructure.ExternalApis.Diary;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace CollegePortal.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly CollegePortalDbContext _dbContext;
    private readonly IConfiguration _configuration;
    private readonly IDiaryApiClient _diaryApiClient;
    private readonly IDataProtector _dataProtector;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        CollegePortalDbContext dbContext,
        IConfiguration configuration,
        IDiaryApiClient diaryApiClient,
        IDataProtectionProvider dataProtectionProvider,
        ILogger<AuthService> logger)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _dbContext = dbContext;
        _configuration = configuration;
        _diaryApiClient = diaryApiClient;
        _dataProtector = dataProtectionProvider.CreateProtector("DiaryIntegration");
        _logger = logger;
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

    // Diary integration: login with diary credentials
    public async Task<LoginResponseDto?> DiaryLoginAsync(string login, string passwordHash, CancellationToken ct = default)
    {
        // Login to diary with pre-computed hash (SHA256 of the password)
        var diaryResult = await _diaryApiClient.LoginWithPrecomputedHashAsync(login, passwordHash, ct);
        if (diaryResult == null)
            return null;

        var externalStudentId = diaryResult.StudentId;

        // Find or create user in our system
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.User)
            .FirstOrDefaultAsync(sp => sp.ExternalStudentId == externalStudentId, ct);

        ApplicationUser user;
        StudentProfile profile;
        if (studentProfile != null)
        {
            user = studentProfile.User;
            profile = studentProfile;
        }
        else
        {
            // Reuse an existing user created by a previous login (e.g. whose profile
            // failed to persist), otherwise create one from the diary login.
            user = await _userManager.FindByNameAsync(login);
            if (user == null)
            {
                user = new ApplicationUser
                {
                    UserName = login,
                    Email = login + "@diary.local",
                    DisplayName = $"{diaryResult.LastName} {diaryResult.FirstName} {diaryResult.MiddleName}".Trim(),
                    Role = "Student",
                    IsActive = true,
                    EmailConfirmed = true
                };

                var createResult = await _userManager.CreateAsync(user, GenerateRandomPassword());
                if (!createResult.Succeeded)
                {
                    _logger.LogError("Diary user creation failed for {Login}: {Errors}",
                        login, string.Join("; ", createResult.Errors.Select(e => e.Code + ":" + e.Description)));
                    return null;
                }
            }

            if (!await _userManager.IsInRoleAsync(user, "Student"))
                await _userManager.AddToRoleAsync(user, "Student");

            // Resolve (or create) the study group so StudentProfile.StudyGroupId is valid.
            var groupName = diaryResult.GroupName;
            if (string.IsNullOrWhiteSpace(groupName))
                groupName = diaryResult.StudentGroupId > 0 ? $"Группа {diaryResult.StudentGroupId}" : "Без группы";

            var studyGroup = await _dbContext.StudyGroups
                .FirstOrDefaultAsync(g => g.Name == groupName, ct);
            if (studyGroup == null)
            {
                studyGroup = new StudyGroup
                {
                    Id = Guid.NewGuid(),
                    Name = groupName,
                    Course = ParseCourseNumber(groupName),
                    AcademicYear = $"{DateTime.UtcNow.Year}-{DateTime.UtcNow.Year + 1}",
                    CreatedAt = DateTime.UtcNow
                };
                _dbContext.StudyGroups.Add(studyGroup);
                await _dbContext.SaveChangesAsync(ct);
            }

            // Create student profile
            profile = new StudentProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                ExternalStudentId = externalStudentId,
                StudyGroupId = studyGroup.Id,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.StudentProfiles.Add(profile);
        }

        // Persist the diary credentials and session cookies (encrypted hash, per-user cookies)
        // so we can automatically re-login / continue the session later.
        profile.DiaryPasswordHash = _dataProtector.Protect(passwordHash);
        if (!string.IsNullOrEmpty(diaryResult.CookieData))
            profile.DiaryCookieData = diaryResult.CookieData;
        profile.DiaryLastSyncedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        // Sync diary data (profile, schedule, grades)
        await SyncDiaryDataAsync(user.Id, diaryResult.StudentId, ct);

        // Generate JWT token
        var roles = await _userManager.GetRolesAsync(user);
        var token = GenerateJwtToken(user, roles);
        var refreshToken = GenerateRefreshToken();
        var expiresAt = DateTime.UtcNow.AddHours(1);

        user.SecurityStamp = Guid.NewGuid().ToString();
        user.LastLoginAt = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);

        var studentProfileAfterSync = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        var userDto = new UserDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName,
            roles.FirstOrDefault() ?? "Student",
            user.IsActive,
            studentProfileAfterSync != null ? new StudentProfileDto(
                studentProfileAfterSync.Id,
                studentProfileAfterSync.StudyGroupId,
                studentProfileAfterSync.StudyGroup?.Name ?? "",
                studentProfileAfterSync.ExternalStudentId
            ) : null
        );

        return new LoginResponseDto(token, GenerateRefreshToken(), expiresAt, userDto);
    }

    public async Task<LoginResponseDto?> DiaryReloginAsync(Guid userId, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.User)
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null || string.IsNullOrEmpty(studentProfile.DiaryPasswordHash))
            return null;

        var user = studentProfile.User;
        if (user == null)
            return null;

        // The diary login is stored in UserName; fall back to the numeric id for legacy rows
        var login = !string.IsNullOrEmpty(user.UserName)
            ? user.UserName
            : studentProfile.ExternalStudentId.ToString();
        var passwordHash = _dataProtector.Unprotect(studentProfile.DiaryPasswordHash);

        var diaryResult = await _diaryApiClient.LoginWithPrecomputedHashAsync(login, passwordHash, ct);
        if (diaryResult == null)
            return null;

        if (!string.IsNullOrEmpty(diaryResult.CookieData))
        {
            studentProfile.DiaryCookieData = diaryResult.CookieData;
            await _dbContext.SaveChangesAsync(ct);
        }

        // Sync data
        await SyncDiaryDataAsync(user.Id, diaryResult.StudentId, ct);

        var roles = await _userManager.GetRolesAsync(user);
        var token = GenerateJwtToken(user, roles);
        var refreshToken = GenerateRefreshToken();
        var expiresAt = DateTime.UtcNow.AddHours(1);

        user.SecurityStamp = Guid.NewGuid().ToString();
        user.LastLoginAt = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);

        var studentProfileAfterSync = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        var userDto = new UserDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName,
            roles.FirstOrDefault() ?? "Student",
            user.IsActive,
            studentProfileAfterSync != null ? new StudentProfileDto(
                studentProfileAfterSync.Id,
                studentProfileAfterSync.StudyGroupId,
                studentProfileAfterSync.StudyGroup?.Name ?? "",
                studentProfileAfterSync.ExternalStudentId
            ) : null
        );

        return new LoginResponseDto(token, GenerateRefreshToken(), expiresAt, userDto);
    }

    public async Task<bool> UpdateDiaryDataAsync(Guid userId, int externalStudentId, string cookieData, string passwordHash, DateTime? cookiesExpiresAt, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null)
            return false;

        studentProfile.DiaryCookieData = cookieData;
        studentProfile.DiaryPasswordHash = _dataProtector.Protect(passwordHash);
        studentProfile.DiaryCookiesExpiresAt = cookiesExpiresAt;
        studentProfile.DiaryLastSyncedAt = DateTime.UtcNow;
        studentProfile.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);
        return true;
    }

    private async Task SyncDiaryDataAsync(Guid userId, int studentId, CancellationToken ct)
    {
        try
        {
            // Sync profile (account settings)
            var accountSettings = await _diaryApiClient.GetAccountSettingsAsync(ct);
            if (accountSettings?.Persons?.Length > 0)
            {
                var person = accountSettings.Persons[0];
                var studentProfile = await _dbContext.StudentProfiles.FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
                if (studentProfile != null)
                {
                    studentProfile.UpdatedAt = DateTime.UtcNow;
                }
            }

            // Sync schedule (2 weeks)
            var weekStart = DateTime.Today;
            weekStart = weekStart.AddDays(-(int)weekStart.DayOfWeek + (weekStart.DayOfWeek == DayOfWeek.Sunday ? 0 : 1)); // Monday
            var weekEnd = weekStart.AddDays(13);
            var schedule = await _diaryApiClient.GetScheduleAsync(studentId, weekStart, weekEnd, ct);
            // Schedule is cached via ScheduleService

            // Sync grades
            var grades = await _diaryApiClient.GetDashboardAsync(studentId, ct);
            // Grades are cached via GradesService

            // Sync performance
            var performance = await _diaryApiClient.GetPerformanceAsync(studentId, ct);
            // Performance is cached via GradesService

            // Update last synced time
            var profile = await _dbContext.StudentProfiles.FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
            if (profile != null)
            {
                profile.DiaryLastSyncedAt = DateTime.UtcNow;
                await _dbContext.SaveChangesAsync(ct);
            }
        }
        catch (Exception ex)
        {
            // Log but don't fail login
        }
    }

    private string GenerateRandomPassword()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes);
    }

    private int ParseCourseNumber(string groupName)
    {
        var match = System.Text.RegularExpressions.Regex.Match(groupName ?? "", @"\d+");
        if (!match.Success)
            return 1;
        return int.TryParse(match.Value[..1], out var course) && course >= 1 && course <= 4 ? course : 1;
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