using System.IdentityModel.Tokens.Jwt;
using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
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
    private static readonly TimeSpan EmailCodeLifetime = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan RegistrationTokenLifetime = TimeSpan.FromMinutes(15);
    private const int MaxEmailCodeAttempts = 5;

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly CollegePortalDbContext _dbContext;
    private readonly IConfiguration _configuration;
    private readonly IDiaryApiClient _diaryApiClient;
    private readonly IEmailSender _emailSender;
    private readonly IOAuthService _oauthService;
    private readonly ICollegeInfoService _collegeInfoService;
    private readonly IDataProtector _dataProtector;
    private readonly IDataProtector _cookieProtector;
    private readonly IDataProtector _oauthPendingProtector;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        CollegePortalDbContext dbContext,
        IConfiguration configuration,
        IDiaryApiClient diaryApiClient,
        IEmailSender emailSender,
        IOAuthService oauthService,
        ICollegeInfoService collegeInfoService,
        IDataProtectionProvider dataProtectionProvider,
        ILogger<AuthService> logger)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _dbContext = dbContext;
        _configuration = configuration;
        _diaryApiClient = diaryApiClient;
        _emailSender = emailSender;
        _oauthService = oauthService;
        _collegeInfoService = collegeInfoService;
        _dataProtector = dataProtectionProvider.CreateProtector("DiaryIntegration");
        _cookieProtector = dataProtectionProvider.CreateProtector("DiaryIntegration.Cookies");
        _oauthPendingProtector = dataProtectionProvider.CreateProtector("OAuthPendingIdentity");
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
        var authProviders = await LoadAuthMethodsAsync(user.Id, studentProfile, ct);

        return ToUserDto(user, roles, studentProfile, authProviders);
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
        var diaryEmail = await GetDiaryEmailAsync(diaryResult.CookieData, ct);

        // Find an existing profile first: the diary student id is the strongest
        // identity and is never re-bound to another portal account.
        var studentProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.User)
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.ExternalStudentId == externalStudentId, ct);

        ApplicationUser? user;
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
            // Account migration: a verified diary email is allowed to attach the
            // diary profile to an existing email/OAuth account that has no
            // StudentProfile yet. A profile already bound to another student is a
            // conflict and must be resolved by an administrator.
            user = string.IsNullOrWhiteSpace(diaryEmail)
                ? null
                : await _userManager.FindByEmailAsync(diaryEmail);

            if (user != null)
            {
                if (!user.IsActive)
                    return null;

                var boundProfile = await _dbContext.StudentProfiles
                    .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);
                if (boundProfile != null)
                {
                    _logger.LogWarning(
                        "Diary student {StudentId} conflicts with existing profile of user {UserId}",
                        externalStudentId, user.Id);
                    return null;
                }
            }
            else
            {
                // Reuse an existing user created by a previous login (e.g. whose
                // profile failed to persist), otherwise create one from the diary.
                var userName = !string.IsNullOrWhiteSpace(diaryEmail) ? diaryEmail! : login;
                user = await _userManager.FindByNameAsync(userName);
                if (user == null)
                {
                    user = new ApplicationUser
                    {
                        UserName = userName,
                        Email = !string.IsNullOrWhiteSpace(diaryEmail) ? diaryEmail! : login + "@diary.local",
                        DisplayName = $"{diaryResult.LastName} {diaryResult.FirstName} {diaryResult.MiddleName}".Trim(),
                        Role = "Student",
                        IsActive = true,
                        EmailConfirmed = true,
                        RegistrationSource = AuthMethod.Diary,
                        LastAuthMethod = AuthMethod.Diary,
                        LastAuthAt = DateTime.UtcNow
                    };

                    var createResult = await _userManager.CreateAsync(user, GenerateRandomPassword());
                    if (!createResult.Succeeded)
                    {
                        _logger.LogError("Diary user creation failed for {Login}: {Errors}",
                            login, string.Join("; ", createResult.Errors.Select(e => e.Code + ":" + e.Description)));
                        return null;
                    }
                }
            }

            if (!await _userManager.IsInRoleAsync(user, "Student"))
                await _userManager.AddToRoleAsync(user, "Student");

            // Resolve (or create) the study group so StudentProfile.StudyGroupId is valid.
            var studyGroup = await GetOrCreateStudyGroupAsync(diaryResult.GroupName, diaryResult.StudentGroupId, ct);

            profile = new StudentProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                ExternalStudentId = externalStudentId,
                StudyGroupId = studyGroup.Id,
                DiaryLogin = login,
                DiaryLinkedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow
            };
            _dbContext.StudentProfiles.Add(profile);
        }

        if (user == null)
            return null;

        // Primary admin: если это защищённый логин (по логину или id), принудительно
        // даём роль админа и защиту от демоции/бана.
        await EnsurePrimaryAdminAsync(user);

        // Persist the diary credentials and session cookies (encrypted hash, encrypted
        // per-user cookies) so we can automatically re-login / continue the session later.
        profile.DiaryLogin = login;
        profile.DiaryLinkedAt ??= DateTime.UtcNow;
        profile.DiaryPasswordHash = _dataProtector.Protect(passwordHash);
        if (!string.IsNullOrEmpty(diaryResult.CookieData))
            profile.DiaryCookieData = ProtectCookies(diaryResult.CookieData);
        profile.DiaryLastSyncedAt = DateTime.UtcNow;
        await AddAuthProviderAsync(user.Id, AuthMethod.Diary, login, diaryEmail, ct);
        await _dbContext.SaveChangesAsync(ct);

        // Sync diary data (profile, schedule, grades)
        await SyncDiaryDataAsync(user.Id, diaryResult.StudentId, ct);

        // Multiple concurrent sessions are allowed: no stamp rotation on login.
        user.LastLoginAt = DateTime.UtcNow;
        user.LastActivityAt = user.LastLoginAt;
        user.LastAuthMethod = AuthMethod.Diary;
        user.LastAuthAt = user.LastLoginAt;
        await TryUpdateUserAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var studentProfileAfterSync = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);

        return await IssueSessionAsync(user, roles, studentProfileAfterSync, ct);
    }

    private async Task<string?> GetDiaryEmailAsync(string? cookieData, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(cookieData))
            return null;

        try
        {
            var settings = await _diaryApiClient.GetAccountSettingsWithCookiesAsync(cookieData, ct);
            return settings?.Persons.FirstOrDefault()?.Email?.Trim();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read diary account email during login");
            return null;
        }
    }

    private async Task<bool> IsAuthProviderTakenAsync(
        AuthMethod provider,
        string providerUserId,
        Guid? exceptUserId,
        CancellationToken ct)
    {
        return await _dbContext.UserAuthProviders.AnyAsync(p =>
            p.Provider == provider &&
            p.ProviderUserId == providerUserId &&
            (exceptUserId == null || p.UserId != exceptUserId.Value), ct);
    }

    private async Task AddAuthProviderAsync(
        Guid userId,
        AuthMethod provider,
        string providerUserId,
        string? email,
        CancellationToken ct)
    {
        var existing = await _dbContext.UserAuthProviders
            .FirstOrDefaultAsync(p => p.UserId == userId && p.Provider == provider, ct);
        if (existing != null)
        {
            existing.ProviderUserId = providerUserId;
            existing.ProviderEmail = email;
            existing.LastLoginAt = DateTime.UtcNow;
            return;
        }

        _dbContext.UserAuthProviders.Add(new UserAuthProvider
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Provider = provider,
            ProviderUserId = providerUserId,
            ProviderEmail = email,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        });
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

        // The diary login is stored on the profile; fall back to UserName / numeric id for legacy rows.
        var login = !string.IsNullOrEmpty(studentProfile.DiaryLogin)
            ? studentProfile.DiaryLogin
            : !string.IsNullOrEmpty(user.UserName)
                ? user.UserName
                : studentProfile.ExternalStudentId?.ToString() ?? string.Empty;
        if (string.IsNullOrEmpty(login))
            return null;
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
        user.LastAuthMethod = AuthMethod.Diary;
        user.LastAuthAt = user.LastLoginAt;
        await AddAuthProviderAsync(user.Id, AuthMethod.Diary, login, null, ct);
        await _dbContext.SaveChangesAsync(ct);
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

    public Task<AuthProvidersDto> GetAuthProvidersAsync(CancellationToken ct = default)
    {
        return Task.FromResult(new AuthProvidersDto(
            _emailSender.IsConfigured,
            _oauthService.GetProviders()));
    }

    public async Task<RequestEmailCodeResultDto> RequestEmailCodeAsync(
        string email,
        string? pendingOAuthToken,
        CancellationToken ct = default)
    {
        const string genericMessage = "Если такая почта доступна, код отправлен на неё";
        if (!TryNormalizeEmail(email, out var normalized))
            return new RequestEmailCodeResultDto(false, "Введите корректный email");

        if (!_emailSender.IsConfigured)
            return new RequestEmailCodeResultDto(false, "Вход по email временно недоступен");

        ExternalIdentity? pendingIdentity = null;
        if (!string.IsNullOrWhiteSpace(pendingOAuthToken))
        {
            pendingIdentity = UnprotectPendingOAuth(pendingOAuthToken);
            if (pendingIdentity == null)
                return new RequestEmailCodeResultDto(false, "Сессия входа через провайдера устарела");
        }

        var now = DateTime.UtcNow;
        var recent = await _dbContext.EmailLoginCodes
            .AsNoTracking()
            .Where(c => c.Email == normalized)
            .OrderByDescending(c => c.CreatedAt)
            .Take(10)
            .ToListAsync(ct);

        // Silent throttling: never reveal whether an account exists.
        if (recent.FirstOrDefault()?.CreatedAt > now.AddSeconds(-60))
            return new RequestEmailCodeResultDto(true, genericMessage);
        if (recent.Count(c => c.CreatedAt > now.AddMinutes(-15)) >= 5)
            return new RequestEmailCodeResultDto(true, genericMessage);

        var active = await _dbContext.EmailLoginCodes
            .Where(c => c.Email == normalized && c.ConsumedAt == null)
            .ToListAsync(ct);
        foreach (var old in active)
            old.ConsumedAt = now;

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var row = new EmailLoginCode
        {
            Id = Guid.NewGuid(),
            Email = normalized,
            CodeHash = HashEmailCode(normalized, code),
            ExpiresAt = now.Add(EmailCodeLifetime),
            CreatedAt = now,
            OAuthProvider = pendingIdentity?.Provider,
            OAuthProviderUserId = pendingIdentity?.ProviderUserId,
            OAuthDisplayName = pendingIdentity?.DisplayName
        };
        _dbContext.EmailLoginCodes.Add(row);
        await _dbContext.SaveChangesAsync(ct);

        try
        {
            await _emailSender.SendLoginCodeAsync(normalized, code, EmailCodeLifetime, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send login code email");
            row.ConsumedAt = now;
            await _dbContext.SaveChangesAsync(ct);
            return new RequestEmailCodeResultDto(false, "Не удалось отправить письмо, попробуйте позже");
        }

        return new RequestEmailCodeResultDto(true, genericMessage);
    }

    public async Task<EmailVerifyResultDto> VerifyEmailCodeAsync(
        string email,
        string code,
        CancellationToken ct = default)
    {
        if (!TryNormalizeEmail(email, out var normalized) || string.IsNullOrWhiteSpace(code))
            return new EmailVerifyResultDto(false, false, null, "Неверный или истёкший код", null, null);

        var now = DateTime.UtcNow;
        var row = await _dbContext.EmailLoginCodes
            .Where(c => c.Email == normalized && c.ConsumedAt == null && c.ExpiresAt > now)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (row == null || row.Attempts >= MaxEmailCodeAttempts)
            return new EmailVerifyResultDto(false, false, null, "Неверный или истёкший код", null, null);

        row.Attempts++;
        if (!FixedTimeEquals(row.CodeHash, HashEmailCode(normalized, code.Trim())))
        {
            if (row.Attempts >= MaxEmailCodeAttempts)
                row.ConsumedAt = now;
            await _dbContext.SaveChangesAsync(ct);
            return new EmailVerifyResultDto(false, false, null, "Неверный или истёкший код", null, null);
        }

        row.ConsumedAt = now;

        var user = await _userManager.FindByEmailAsync(normalized);
        if (user == null)
        {
            var token = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
            row.RegistrationTokenHash = HashRegistrationToken(token);
            row.RegistrationTokenExpiresAt = now.Add(RegistrationTokenLifetime);
            await _dbContext.SaveChangesAsync(ct);
            return new EmailVerifyResultDto(true, true, token, null, null, null);
        }

        if (!user.IsActive)
        {
            await _dbContext.SaveChangesAsync(ct);
            return new EmailVerifyResultDto(false, false, null, "Аккаунт заблокирован", null, null);
        }

        if (row.OAuthProvider is { } oauthProvider && !string.IsNullOrWhiteSpace(row.OAuthProviderUserId))
        {
            if (await IsAuthProviderTakenAsync(oauthProvider, row.OAuthProviderUserId, user.Id, ct))
            {
                await _dbContext.SaveChangesAsync(ct);
                return new EmailVerifyResultDto(false, false, null,
                    "Этот способ входа уже привязан к другому аккаунту", null, null, Conflict: true);
            }
            await AddAuthProviderAsync(user.Id, oauthProvider, row.OAuthProviderUserId, normalized, ct);
        }
        await AddAuthProviderAsync(user.Id, AuthMethod.Email, normalized, normalized, ct);

        user.LastLoginAt = now;
        user.LastActivityAt = now;
        user.LastAuthMethod = AuthMethod.Email;
        user.LastAuthAt = now;
        await _dbContext.SaveChangesAsync(ct);
        await TryUpdateUserAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var profile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);
        var session = await IssueSessionAsync(user, roles, profile, ct);

        return new EmailVerifyResultDto(true, false, null, null, session.User, session);
    }

    public async Task<RegistrationOutcome> CompleteEmailRegistrationAsync(
        CompleteEmailRegistrationRequestDto request,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.RegistrationToken))
            return new RegistrationOutcome("Ссылка регистрации недействительна", false, null);

        var tokenHash = HashRegistrationToken(request.RegistrationToken);
        var now = DateTime.UtcNow;
        var row = await _dbContext.EmailLoginCodes
            .FirstOrDefaultAsync(c =>
                c.RegistrationTokenHash == tokenHash &&
                c.RegistrationTokenExpiresAt > now &&
                c.ConsumedAt != null, ct);
        if (row == null)
            return new RegistrationOutcome("Ссылка регистрации истекла, запросите новый код", false, null);

        if (!TryBuildDisplayName(request.LastName, request.FirstName, request.MiddleName, out var displayName, out var nameError))
            return new RegistrationOutcome(nameError, false, null);

        var groupName = await GetCanonicalGroupNameAsync(request.GroupName, ct);
        if (groupName == null)
            return new RegistrationOutcome("Выберите группу из справочника колледжа", false, null);

        if (await _userManager.FindByEmailAsync(row.Email) != null)
            return new RegistrationOutcome("Аккаунт с такой почтой уже существует", true, null);

        if (row.OAuthProvider is { } pendingProvider &&
            !string.IsNullOrWhiteSpace(row.OAuthProviderUserId) &&
            await IsAuthProviderTakenAsync(pendingProvider, row.OAuthProviderUserId, null, ct))
        {
            return new RegistrationOutcome("Этот способ входа уже привязан к другому аккаунту", true, null);
        }

        var source = row.OAuthProvider ?? AuthMethod.Email;
        var user = new ApplicationUser
        {
            UserName = row.Email,
            Email = row.Email,
            DisplayName = displayName,
            Role = "Student",
            IsActive = true,
            EmailConfirmed = true,
            RegistrationSource = source,
            LastAuthMethod = source,
            LastAuthAt = now,
            LastLoginAt = now,
            LastActivityAt = now
        };

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(ct);
        try
        {
            var createResult = await _userManager.CreateAsync(user, GenerateRandomPassword());
            if (!createResult.Succeeded)
            {
                await transaction.RollbackAsync(ct);
                _logger.LogWarning("Email registration failed: {Errors}",
                    string.Join("; ", createResult.Errors.Select(e => e.Description)));
                return new RegistrationOutcome("Не удалось создать аккаунт", false, null);
            }

            await _userManager.AddToRoleAsync(user, "Student");

            var group = await GetOrCreateStudyGroupAsync(groupName, 0, ct);
            var profile = new StudentProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                StudyGroupId = group.Id,
                ExternalStudentId = null,
                CreatedAt = now
            };
            _dbContext.StudentProfiles.Add(profile);

            await AddAuthProviderAsync(user.Id, AuthMethod.Email, row.Email, row.Email, ct);
            if (row.OAuthProvider is { } provider && !string.IsNullOrWhiteSpace(row.OAuthProviderUserId))
                await AddAuthProviderAsync(user.Id, provider, row.OAuthProviderUserId, row.Email, ct);

            row.RegistrationTokenHash = null;
            row.RegistrationTokenExpiresAt = null;
            await _dbContext.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);

            var roles = await _userManager.GetRolesAsync(user);
            var savedProfile = await _dbContext.StudentProfiles
                .Include(sp => sp.StudyGroup)
                .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);
            var session = await IssueSessionAsync(user, roles, savedProfile, ct);
            return new RegistrationOutcome(null, false, session);
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(ct);
            _logger.LogError(ex, "Email registration failed for {Email}", row.Email);
            return new RegistrationOutcome("Не удалось завершить регистрацию", false, null);
        }
    }

    public async Task<ExternalLoginResult> ExternalLoginAsync(
        ExternalIdentity identity,
        CancellationToken ct = default)
    {
        if (identity.Provider is not (AuthMethod.Google or AuthMethod.GitHub or AuthMethod.Yandex or AuthMethod.Vk))
            return new ExternalLoginResult(false, null, identity.DisplayName, null);

        if (!identity.EmailVerified || !TryNormalizeEmail(identity.Email, out var email))
        {
            return new ExternalLoginResult(
                true,
                ProtectPendingOAuth(identity),
                identity.DisplayName,
                null);
        }

        var linked = await _dbContext.UserAuthProviders
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Provider == identity.Provider && p.ProviderUserId == identity.ProviderUserId, ct);

        ApplicationUser? user = linked == null
            ? null
            : await _userManager.FindByIdAsync(linked.UserId.ToString());

        if (user == null)
            user = await _userManager.FindByEmailAsync(email);

        var now = DateTime.UtcNow;
        if (user == null)
        {
            user = new ApplicationUser
            {
                UserName = email,
                Email = email,
                DisplayName = identity.DisplayName,
                Role = "Student",
                IsActive = true,
                EmailConfirmed = true,
                RegistrationSource = identity.Provider,
                LastAuthMethod = identity.Provider,
                LastAuthAt = now,
                LastLoginAt = now,
                LastActivityAt = now
            };

            var createResult = await _userManager.CreateAsync(user, GenerateRandomPassword());
            if (!createResult.Succeeded)
            {
                _logger.LogWarning("External user creation failed for {Provider}: {Errors}",
                    identity.Provider, string.Join("; ", createResult.Errors.Select(e => e.Description)));
                return new ExternalLoginResult(false, null, identity.DisplayName, null);
            }
            await _userManager.AddToRoleAsync(user, "Student");
        }

        if (!user.IsActive)
            return new ExternalLoginResult(false, null, identity.DisplayName, null);

        user.LastLoginAt = now;
        user.LastActivityAt = now;
        user.LastAuthMethod = identity.Provider;
        user.LastAuthAt = now;
        if (string.IsNullOrWhiteSpace(user.Email))
        {
            user.Email = email;
            user.EmailConfirmed = true;
        }

        await AddAuthProviderAsync(user.Id, identity.Provider, identity.ProviderUserId, email, ct);
        await _dbContext.SaveChangesAsync(ct);
        await TryUpdateUserAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var profile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);
        var session = await IssueSessionAsync(user, roles, profile, ct);

        return new ExternalLoginResult(false, null, identity.DisplayName, session);
    }

    public async Task<LinkDiaryResult> LinkDiaryAsync(
        Guid userId,
        string login,
        string passwordHash,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(passwordHash))
            return new LinkDiaryResult("Введите логин и пароль дневника", false, null);

        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null || !user.IsActive)
            return new LinkDiaryResult("Пользователь не найден", false, null);

        var profile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
        if (profile?.ExternalStudentId != null)
            return new LinkDiaryResult("Дневник уже привязан к этому аккаунту", false, null);

        var diaryResult = await _diaryApiClient.LoginWithPrecomputedHashAsync(login, passwordHash, ct);
        if (diaryResult == null)
            return new LinkDiaryResult("Неверный логин или пароль дневника", false, null);

        var alreadyLinked = await _dbContext.StudentProfiles
            .Include(sp => sp.User)
            .FirstOrDefaultAsync(sp => sp.ExternalStudentId == diaryResult.StudentId, ct);
        if (alreadyLinked != null && alreadyLinked.UserId != userId)
            return new LinkDiaryResult(
                "Этот дневник уже привязан к другому аккаунту. Обратитесь в администрацию.",
                true,
                null);

        if (await IsAuthProviderTakenAsync(AuthMethod.Diary, login, userId, ct))
            return new LinkDiaryResult(
                "Этот способ входа уже привязан к другому аккаунту. Обратитесь в администрацию.",
                true,
                null);

        var diaryEmail = await GetDiaryEmailAsync(diaryResult.CookieData, ct);
        if (!string.IsNullOrWhiteSpace(diaryEmail))
        {
            var emailOwner = await _userManager.FindByEmailAsync(diaryEmail);
            if (emailOwner != null && emailOwner.Id != userId)
                return new LinkDiaryResult(
                    "Почта дневника уже используется другим аккаунтом. Обратитесь к администратору.",
                    true,
                    null);

            user.Email = diaryEmail;
            user.EmailConfirmed = true;
        }

        var group = await GetOrCreateStudyGroupAsync(diaryResult.GroupName, diaryResult.StudentGroupId, ct);
        var now = DateTime.UtcNow;
        if (profile == null)
        {
            profile = new StudentProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                StudyGroupId = group.Id,
                ExternalStudentId = diaryResult.StudentId,
                CreatedAt = now
            };
            _dbContext.StudentProfiles.Add(profile);
        }
        else
        {
            profile.StudyGroupId = group.Id;
            profile.ExternalStudentId = diaryResult.StudentId;
        }

        profile.DiaryLogin = login;
        profile.DiaryLinkedAt = now;
        profile.DiaryPasswordHash = _dataProtector.Protect(passwordHash);
        if (!string.IsNullOrEmpty(diaryResult.CookieData))
            profile.DiaryCookieData = ProtectCookies(diaryResult.CookieData);
        profile.DiaryLastSyncedAt = now;
        profile.UpdatedAt = now;

        await AddAuthProviderAsync(user.Id, AuthMethod.Diary, login, diaryEmail, ct);

        user.LastAuthMethod = AuthMethod.Diary;
        user.LastAuthAt = now;
        user.LastLoginAt = now;
        user.LastActivityAt = now;
        // The account's identity scope changed: invalidate every existing token.
        user.SecurityStamp = Guid.NewGuid().ToString();
        await _dbContext.SaveChangesAsync(ct);
        await RevokeAllRefreshTokensAsync(user.Id, ct);

        await SyncDiaryDataAsync(user.Id, diaryResult.StudentId, ct);

        var roles = await _userManager.GetRolesAsync(user);
        var savedProfile = await _dbContext.StudentProfiles
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == user.Id, ct);
        var session = await IssueSessionAsync(user, roles, savedProfile, ct);
        return new LinkDiaryResult(null, false, session);
    }

    public async Task<ProfileUpdateResult> CompleteProfileAsync(
        Guid userId,
        CompleteProfileRequestDto request,
        CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null || !user.IsActive)
            return new ProfileUpdateResult(false, "Пользователь не найден");

        var existing = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
        if (existing != null)
            return new ProfileUpdateResult(true);

        if (!TryBuildDisplayName(request.LastName, request.FirstName, request.MiddleName, out var displayName, out var nameError))
            return new ProfileUpdateResult(false, nameError);

        var groupName = await GetCanonicalGroupNameAsync(request.GroupName, ct);
        if (groupName == null)
            return new ProfileUpdateResult(false, "Выберите группу из справочника колледжа");

        var group = await GetOrCreateStudyGroupAsync(groupName, 0, ct);
        _dbContext.StudentProfiles.Add(new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            StudyGroupId = group.Id,
            ExternalStudentId = null,
            CreatedAt = DateTime.UtcNow
        });

        user.DisplayName = displayName;
        await _dbContext.SaveChangesAsync(ct);
        await TryUpdateUserAsync(user);
        return new ProfileUpdateResult(true);
    }

    private static bool TryNormalizeEmail(string? value, out string normalized)
    {
        normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length is 0 or > 320)
            return false;

        try
        {
            var address = new MailAddress(normalized);
            return address.Address.Equals(normalized, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static bool TryBuildDisplayName(
        string? lastName,
        string? firstName,
        string? middleName,
        out string displayName,
        out string error)
    {
        var last = (lastName ?? string.Empty).Trim();
        var first = (firstName ?? string.Empty).Trim();
        var middle = (middleName ?? string.Empty).Trim();
        displayName = string.Join(' ', new[] { last, first, middle }.Where(v => v.Length > 0));

        if (last.Length == 0 || first.Length == 0)
        {
            error = "Фамилия и имя обязательны";
            return false;
        }
        if (last.Length > 100 || first.Length > 100 || middle.Length > 100)
        {
            error = "ФИО слишком длинное";
            return false;
        }

        error = string.Empty;
        return true;
    }

    private async Task<string?> GetCanonicalGroupNameAsync(string? groupName, CancellationToken ct)
    {
        var requested = groupName?.Trim();
        if (string.IsNullOrWhiteSpace(requested))
            return null;

        var catalog = await _collegeInfoService.GetCatalogAsync(ct);
        return catalog?.Groups.FirstOrDefault(g =>
            string.Equals(g, requested, StringComparison.OrdinalIgnoreCase));
    }

    private string HashEmailCode(string email, string code)
    {
        var pepper = _configuration["Auth:OtpPepper"];
        if (string.IsNullOrWhiteSpace(pepper))
            pepper = _configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(pepper))
            throw new InvalidOperationException("Auth:OtpPepper or Jwt:Key must be configured.");
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(pepper));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{email}:{code}"));
        return Convert.ToHexString(hash);
    }

    private static string HashRegistrationToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static bool FixedTimeEquals(string left, string right)
    {
        var a = Encoding.UTF8.GetBytes(left);
        var b = Encoding.UTF8.GetBytes(right);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    private string ProtectPendingOAuth(ExternalIdentity identity)
    {
        var json = JsonSerializer.Serialize(identity);
        return _oauthPendingProtector.Protect(json);
    }

    private ExternalIdentity? UnprotectPendingOAuth(string token)
    {
        try
        {
            var json = _oauthPendingProtector.Unprotect(token);
            return JsonSerializer.Deserialize<ExternalIdentity>(json);
        }
        catch
        {
            return null;
        }
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
        catch
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

    private static UserDto ToUserDto(
        ApplicationUser user,
        IList<string> roles,
        StudentProfile? profile,
        AuthMethod[] authProviders)
    {
        var hasDiaryLink = profile?.ExternalStudentId != null;
        var isStudent = !roles.Contains("Admin", StringComparer.OrdinalIgnoreCase);

        return new UserDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName,
            isStudent ? "Student" : "Admin",
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
                : null,
            user.RegistrationSource,
            user.LastAuthMethod,
            authProviders,
            hasDiaryLink,
            isStudent && profile == null,
            user.EmailConfirmed
        );
    }

    private async Task<AuthMethod[]> LoadAuthMethodsAsync(
        Guid userId,
        StudentProfile? profile,
        CancellationToken ct)
    {
        var methods = await _dbContext.UserAuthProviders
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Select(p => p.Provider)
            .ToListAsync(ct);

        if (profile?.ExternalStudentId != null && !methods.Contains(AuthMethod.Diary))
            methods.Add(AuthMethod.Diary);

        return methods.Distinct().OrderBy(m => m).ToArray();
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
        var authProviders = await LoadAuthMethodsAsync(user.Id, profile, ct);

        return new LoginResponseDto(
            accessToken,
            refreshToken,
            accessExpiresAt,
            ToUserDto(user, roles, profile, authProviders));
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