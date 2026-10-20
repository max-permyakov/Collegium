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
    private readonly IDataProtector _cookieProtector;
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
        _cookieProtector = dataProtectionProvider.CreateProtector("DiaryIntegration.Cookies");
        _logger = logger;
    }

    private TimeSpan AccessTokenLifetime =>
        TimeSpan.FromMinutes(_configuration.GetValue("Auth:AccessTokenMinutes", 15));

    private TimeSpan RefreshTokenLifetime =>
        TimeSpan.FromDays(_configuration.GetValue("Auth:RefreshTokenDays", 30));

    private string ProtectCookies(string cookieData) => _cookieProtector.Protect(cookieData);

    public async Task<LoginResponseDto?> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var user = await _userManager.FindByEmailAsync(email);
        if (user == null || !user.IsActive)
            return null;

        var result = await _signInManager.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
        if (!result.Succeeded)
            return null;

        await EnsurePrimaryAdminAsync(user);

        // Multiple concurrent sessions are allowed: the security stamp is only
        // rotated on ban / role change, never on login.
        user.LastLoginAt = DateTime.UtcNow;
        user.LastActivityAt = user.LastLoginAt;
        await TryUpdateUserAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        return await IssueSessionAsync(user, roles, studentProfile, ct);
    }

    // Signs out of the current device only: revokes the presented refresh
    // token, leaving sessions on other devices intact. The short-lived access
    // token of this device expires on its own within minutes.
    public async Task LogoutAsync(Guid userId, string? refreshToken, CancellationToken ct = default)
    {
        await RevokeRefreshTokenAsync(refreshToken, ct);
        await _signInManager.SignOutAsync();
    }

    public async Task RevokeAllRefreshTokensAsync(Guid userId, CancellationToken ct = default)
    {
        var tokens = await _dbContext.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync(ct);
        if (tokens.Count == 0)
            return;

        var now = DateTime.UtcNow;
        foreach (var token in tokens)
            token.RevokedAt = now;
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task<LoginResponseDto?> RefreshSessionAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return null;

        var hash = HashRefreshToken(refreshToken);
        var stored = await _dbContext.RefreshTokens
            .FirstOrDefaultAsync(t => t.TokenHash == hash, ct);

        if (stored == null || !stored.IsActive)
            return null;

        var user = await _userManager.FindByIdAsync(stored.UserId.ToString());
        if (user == null || !user.IsActive)
        {
            // Invalidate the dangling credential.
            stored.RevokedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(ct);
            return null;
        }

        // Sliding session: revoke the presented token before issuing a new pair
        // so a stolen cookie stops working after its first use.
        stored.RevokedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        var roles = await _userManager.GetRolesAsync(user);
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        return await IssueSessionAsync(user, roles, studentProfile, ct);
    }

    private async Task RevokeRefreshTokenAsync(string? refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return;

        var hash = HashRefreshToken(refreshToken);
        var stored = await _dbContext.RefreshTokens
            .FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored == null || stored.RevokedAt != null)
            return;

        stored.RevokedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
    }

    public async Task<UserDto?> GetCurrentUserAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null || !user.IsActive)
            return null;

        await EnsurePrimaryAdminAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        return ToUserDto(user, roles, studentProfile);
    }

    public async Task<LoginResponseDto?> ClaimPrimaryAdminAsync(Guid userId, string secret, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(secret) || !VerifyPrimaryAdminSecret(secret))
            return null;

        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null || !user.IsActive)
            return null;

        user.Role = "Admin";
        user.IsProtected = true;
        // Rotate the security stamp so any token issued under the old role is
        // revoked; a fresh token with the Admin role is issued below.
        var newStamp = Guid.NewGuid().ToString();
        user.SecurityStamp = newStamp;

        // A silent concurrency failure here would mint a token whose stamp
        // never reaches the database (every request would then 401), so retry
        // against the freshly loaded row and fail loudly instead.
        user = await UpdateUserWithConcurrencyRetryAsync(user, u =>
        {
            u.Role = "Admin";
            u.IsProtected = true;
            u.SecurityStamp = newStamp;
        });
        if (user == null)
            return null;

        if (!await _userManager.IsInRoleAsync(user, "Admin"))
            await _userManager.AddToRoleAsync(user, "Admin");

        _logger.LogInformation("User {UserId} claimed primary admin.", user.Id);

        var roles = await _userManager.GetRolesAsync(user);
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        return await IssueSessionAsync(user, roles, studentProfile, ct);
    }

    private bool VerifyPrimaryAdminSecret(string provided)
    {
        // Preferred: a PBKDF2 hash (ASP.NET Identity format) stored in
        // PrimaryAdmin:SecretHash. Fallback: a plaintext secret in
        // PrimaryAdmin:Secret, compared in constant time.
        var secretHash = _configuration["PrimaryAdmin:SecretHash"];
        if (!string.IsNullOrWhiteSpace(secretHash))
        {
            var hasher = new PasswordHasher<ApplicationUser>();
            var verification = hasher.VerifyHashedPassword(new ApplicationUser(), secretHash, provided);
            return verification != PasswordVerificationResult.Failed;
        }

        var secret = _configuration["PrimaryAdmin:Secret"];
        if (string.IsNullOrWhiteSpace(secret))
            return false;

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(secret),
            Encoding.UTF8.GetBytes(provided));
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

    // Diary integration: login with diary credentials. The diary API expects the
    // password to be pre-hashed (SHA-256, base64) by the caller, so the raw diary
    // password never reaches this server; the pre-hashed credential is encrypted
    // before being stored.
    public async Task<LoginResponseDto?> DiaryLoginAsync(string login, string passwordHash, CancellationToken ct = default)
    {
        var diaryResult = await _diaryApiClient.LoginWithPrecomputedHashAsync(login, passwordHash, ct);
        if (diaryResult == null)
            return null;

        var externalStudentId = diaryResult.StudentId;

        // Find or create user in our system
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.User)
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.ExternalStudentId == externalStudentId, ct);

        ApplicationUser user;
        StudentProfile profile;
        if (studentProfile != null)
        {
            user = studentProfile.User;
            profile = studentProfile;

            // Self-heal: если при прошлом входе не было настоящего названия группы
            // (плейсхолдер «Группа N» / «Без группы»), а дневник сейчас вернул его,
            // перепривязываем профиль к настоящей группе (важно для kkepik-расписания).
            if (!string.IsNullOrWhiteSpace(diaryResult.GroupName) &&
                IsPlaceholderGroupName(profile.StudyGroup?.Name))
            {
                var realGroup = await GetOrCreateStudyGroupAsync(diaryResult.GroupName, diaryResult.StudentGroupId, ct);
                if (realGroup.Id != profile.StudyGroupId)
                {
                    profile.StudyGroupId = realGroup.Id;
                    await _dbContext.SaveChangesAsync(ct);
                    _logger.LogInformation("Reassigned student {StudentId} to study group {Group}", externalStudentId, diaryResult.GroupName);
                }
            }
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
            var studyGroup = await GetOrCreateStudyGroupAsync(diaryResult.GroupName, diaryResult.StudentGroupId, ct);

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

        // Primary admin: если это защищённый логин (по логину или id), принудительно
        // даём роль админа и защиту от демоции/бана.
        await EnsurePrimaryAdminAsync(user);

        // Persist the diary credentials and session cookies (encrypted hash, encrypted
        // per-user cookies) so we can automatically re-login / continue the session later.
        profile.DiaryPasswordHash = _dataProtector.Protect(passwordHash);
        if (!string.IsNullOrEmpty(diaryResult.CookieData))
            profile.DiaryCookieData = ProtectCookies(diaryResult.CookieData);
        profile.DiaryLastSyncedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        // Sync diary data (profile, schedule, grades)
        await SyncDiaryDataAsync(user.Id, diaryResult.StudentId, ct);

        // Multiple concurrent sessions are allowed: no stamp rotation on login.
        user.LastLoginAt = DateTime.UtcNow;
        user.LastActivityAt = user.LastLoginAt;
        await TryUpdateUserAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var studentProfileAfterSync = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        return await IssueSessionAsync(user, roles, studentProfileAfterSync, ct);
    }

    public async Task<LoginResponseDto?> DiaryReloginAsync(Guid userId, string? currentRefreshToken = null, CancellationToken ct = default)
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

        await EnsurePrimaryAdminAsync(user);

        if (!string.IsNullOrEmpty(diaryResult.CookieData))
        {
            studentProfile.DiaryCookieData = ProtectCookies(diaryResult.CookieData);
            await _dbContext.SaveChangesAsync(ct);
        }

        // Sync data
        await SyncDiaryDataAsync(user.Id, diaryResult.StudentId, ct);

        // Refreshing the external diary session is not a security event: the
        // security stamp stays untouched so other portal sessions keep working.
        user.LastLoginAt = DateTime.UtcNow;
        user.LastActivityAt = user.LastLoginAt;
        await TryUpdateUserAsync(user);

        // Rotate the session credentials (sliding expiry): revoke the refresh
        // token this request was authenticated with and issue a fresh pair.
        await RevokeRefreshTokenAsync(currentRefreshToken, ct);

        var roles = await _userManager.GetRolesAsync(user);
        var studentProfileAfterSync = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        return await IssueSessionAsync(user, roles, studentProfileAfterSync, ct);
    }

    public async Task<bool> UpdateDiaryDataAsync(Guid userId, int externalStudentId, string cookieData, string passwordHash, DateTime? cookiesExpiresAt, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null)
            return false;

        studentProfile.DiaryCookieData = ProtectCookies(cookieData);
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

                // The diary is the source of truth for contacts: mirror its
                // email/phone onto our user (overriding the @diary.local
                // placeholder or a previously synced value).
                var user = await _userManager.FindByIdAsync(userId.ToString());
                if (user != null)
                {
                    var userChanged = false;

                    var diaryEmail = person.Email?.Trim();
                    if (!string.IsNullOrWhiteSpace(diaryEmail) &&
                        !string.Equals(user.Email, diaryEmail, StringComparison.OrdinalIgnoreCase))
                    {
                        var existing = await _userManager.FindByEmailAsync(diaryEmail);
                        if (existing == null || existing.Id == user.Id)
                        {
                            user.Email = diaryEmail;
                            user.EmailConfirmed = true;
                            userChanged = true;
                        }
                        else
                        {
                            _logger.LogWarning("Diary email {Email} is already used by another account; skipping", diaryEmail);
                        }
                    }

                    var diaryPhone = person.Phone?.Trim();
                    if (!string.IsNullOrWhiteSpace(diaryPhone) &&
                        !string.Equals(user.PhoneNumber, diaryPhone, StringComparison.Ordinal))
                    {
                        user.PhoneNumber = diaryPhone;
                        userChanged = true;
                    }

                    if (userChanged)
                    {
                        var updateResult = await _userManager.UpdateAsync(user);
                        if (!updateResult.Succeeded)
                            _logger.LogWarning("Failed to update contacts for user {UserId}", userId);
                    }
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

    private static bool IsPlaceholderGroupName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return true;
        return name == "Без группы" || name.StartsWith("Группа ", StringComparison.Ordinal);
    }

    private async Task<StudyGroup> GetOrCreateStudyGroupAsync(string? groupName, int studentGroupId, CancellationToken ct)
    {
        var name = !string.IsNullOrWhiteSpace(groupName)
            ? groupName
            : studentGroupId > 0 ? $"Группа {studentGroupId}" : "Без группы";

        var studyGroup = await _dbContext.StudyGroups
            .FirstOrDefaultAsync(g => g.Name == name, ct);
        if (studyGroup == null)
        {
            studyGroup = new StudyGroup
            {
                Id = Guid.NewGuid(),
                Name = name,
                Course = ParseCourseNumber(name),
                AcademicYear = $"{DateTime.UtcNow.Year}-{DateTime.UtcNow.Year + 1}",
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.StudyGroups.Add(studyGroup);
            await _dbContext.SaveChangesAsync(ct);
        }

        return studyGroup;
    }

    private async Task<bool> IsPrimaryAdminAsync(ApplicationUser user)
    {
        // No default/magic values: primary admins are opt-in via configuration only.
        var logins = (_configuration["PrimaryAdmin:Logins"] ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet(StringComparer.Ordinal);
        var ids = (_configuration["PrimaryAdmin:UserIds"] ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (logins.Count == 0 && ids.Count == 0)
            return false;

        return logins.Contains(user.UserName ?? "") || ids.Contains(user.Id.ToString());
    }

    private async Task EnsurePrimaryAdminAsync(ApplicationUser user)
    {
        if (!await IsPrimaryAdminAsync(user))
            return;

        var changed = false;
        if (user.Role != "Admin")
        {
            user.Role = "Admin";
            changed = true;
        }
        if (!user.IsProtected)
        {
            user.IsProtected = true;
            changed = true;
        }
        if (!await _userManager.IsInRoleAsync(user, "Admin"))
        {
            var roleResult = await _userManager.AddToRoleAsync(user, "Admin");
            changed |= roleResult.Succeeded;
        }

        if (changed)
            await _userManager.UpdateAsync(user);
    }

    private UserDto ToUserDto(ApplicationUser user, IList<string> roles, StudentProfile? profile)
    {
        return new UserDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName,
            roles.Contains("Admin", StringComparer.OrdinalIgnoreCase) ? "Admin" : (roles.FirstOrDefault() ?? "Student"),
            user.IsActive,
            user.IsProtected,
            user.PhoneNumber,
            profile != null
                ? new StudentProfileDto(
                    profile.Id,
                    profile.StudyGroupId,
                    profile.StudyGroup?.Name ?? "",
                    profile.ExternalStudentId,
                    profile.Bio,
                    profile.AvatarDataUrl,
                    profile.HeadmanRole.ToString(),
                    profile.AverageMark,
                    profile.GradesCachedAt
                )
                : null
        );
    }

    // Mints the access token + refresh token pair for the given user. Both
    // cookies must be set by the caller; neither value is serialized to JSON.
    private async Task<LoginResponseDto> IssueSessionAsync(
        ApplicationUser user,
        IList<string> roles,
        StudentProfile? profile,
        CancellationToken ct)
    {
        var accessToken = GenerateJwtToken(user, roles);
        var accessExpiresAt = DateTime.UtcNow.Add(AccessTokenLifetime);
        var refreshToken = await CreateRefreshTokenAsync(user.Id, ct);

        return new LoginResponseDto(accessToken, refreshToken, accessExpiresAt, ToUserDto(user, roles, profile));
    }

    // Generates a cryptographically random opaque token, persists only its
    // SHA-256 hash, and returns the raw value for the client cookie.
    private async Task<string> CreateRefreshTokenAsync(Guid userId, CancellationToken ct)
    {
        var value = GenerateRefreshTokenValue();
        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TokenHash = HashRefreshToken(value),
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.Add(RefreshTokenLifetime)
        });
        await _dbContext.SaveChangesAsync(ct);
        return value;
    }

    private static string GenerateRefreshTokenValue()
    {
        var bytes = new byte[64];
        RandomNumberGenerator.Fill(bytes);
        return Base64UrlEncoder.Encode(bytes);
    }

    private static string HashRefreshToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    // Persists user changes and logs (instead of silently dropping) failures
    // such as Identity concurrency conflicts. Used for cosmetic updates
    // (LastLoginAt) where a lost write is harmless.
    private async Task TryUpdateUserAsync(ApplicationUser user)
    {
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            _logger.LogWarning("Failed to update user {UserId}: {Errors}",
                user.Id, string.Join("; ", result.Errors.Select(e => e.Description)));
        }
    }

    // Like TryUpdateUserAsync, but for changes that MUST reach the database
    // (e.g. security-stamp rotation): on a concurrency conflict the latest row
    // is reloaded, the changes are re-applied via `applyChanges`, and the
    // update is retried. Returns null when the update could not be persisted.
    private async Task<ApplicationUser?> UpdateUserWithConcurrencyRetryAsync(
        ApplicationUser user,
        Action<ApplicationUser> applyChanges)
    {
        for (var attempt = 1; ; attempt++)
        {
            var result = await _userManager.UpdateAsync(user);
            if (result.Succeeded)
                return user;

            var isConcurrency = result.Errors.Any(e => e.Code == "ConcurrencyFailure");
            if (!isConcurrency || attempt >= 3)
            {
                _logger.LogError("Failed to update user {UserId} (attempt {Attempt}): {Errors}",
                    user.Id, attempt, string.Join("; ", result.Errors.Select(e => e.Description)));
                return null;
            }

            var fresh = await _userManager.FindByIdAsync(user.Id.ToString());
            if (fresh == null)
                return null;

            applyChanges(fresh);
            user = fresh;
        }
    }

    private string GenerateJwtToken(ApplicationUser user, IList<string> roles)
    {
        var jwtKey = _configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey))
            throw new InvalidOperationException("Jwt:Key is not configured.");

        var jwtIssuer = _configuration["Jwt:Issuer"] ?? "CollegePortal";
        var jwtAudience = _configuration["Jwt:Audience"] ?? "CollegePortalClient";

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email ?? ""),
            new(ClaimTypes.Name, user.DisplayName),
            new("role", user.Role),
            // Enables immediate server-side revocation (ban / role change) by
            // comparing the token's stamp with the current user record.
            new("sstamp", user.SecurityStamp ?? "")
        };

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: DateTime.UtcNow.Add(AccessTokenLifetime),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}