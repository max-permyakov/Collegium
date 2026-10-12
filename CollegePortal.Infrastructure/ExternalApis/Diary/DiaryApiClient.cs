using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CollegePortal.Infrastructure.ExternalApis.Diary;

public class DiaryApiOptions
{
    public string BaseUrl { get; set; } = "https://spo.rso23.ru";
    public int TimeoutSeconds { get; set; } = 30;
}

public class DiaryApiClient : IDiaryApiClient
{
    private readonly HttpClient _httpClient;
    private readonly DiaryApiOptions _options;
    private readonly ILogger<DiaryApiClient> _logger;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly CollegePortalDbContext _dbContext;
    private readonly IDataProtector _dataProtector;
    private readonly IDataProtector _cookieProtector;

    public DiaryApiClient(
        HttpClient httpClient,
        IOptions<DiaryApiOptions> options,
        ILogger<DiaryApiClient> logger,
        IHttpContextAccessor httpContextAccessor,
        CollegePortalDbContext dbContext,
        IDataProtectionProvider dataProtectionProvider)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
        _httpContextAccessor = httpContextAccessor;
        _dbContext = dbContext;
        _dataProtector = dataProtectionProvider.CreateProtector("DiaryIntegration");
        _cookieProtector = dataProtectionProvider.CreateProtector("DiaryIntegration.Cookies");

        _httpClient.BaseAddress = new Uri(_options.BaseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds);
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        _httpClient.DefaultRequestHeaders.Accept.ParseAdd("application/json, text/plain, */*");
    }

    // Diary session cookies are encrypted at rest. Tolerates legacy plaintext rows.
    private string ProtectCookies(string cookieData) => _cookieProtector.Protect(cookieData);

    private string? UnprotectCookies(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return null;

        try
        {
            return _cookieProtector.Unprotect(value);
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            return value;
        }
    }

    // ---------------------------------------------------------------------
    // Per-user cookie management
    //
    // The diary authenticates via cookies. Cookies must be isolated per user,
    // so the shared HttpClient handler is configured with UseCookies=false and
    // we attach/store cookies explicitly via the "Cookie" request header and
    // the "Set-Cookie" response header, persisting them in StudentProfile.DiaryCookieData.
    // ---------------------------------------------------------------------

    private Guid? TryGetCurrentUserId()
    {
        var id = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(id, out var userId) ? userId : null;
    }

    private async Task<string?> GetStoredCookieHeaderAsync(Guid? userId, CancellationToken ct)
    {
        if (userId == null)
            return null;

        var profile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        return UnprotectCookies(profile?.DiaryCookieData);
    }

    private static IReadOnlyList<string> ExtractSetCookies(HttpResponseMessage response)
    {
        var cookies = new List<string>();
        if (response.Headers.TryGetValues("Set-Cookie", out var set1))
            cookies.AddRange(set1);
        if (response.Content.Headers.TryGetValues("Set-Cookie", out var set2))
            cookies.AddRange(set2);
        return cookies;
    }

    private static string MergeCookieData(string? existing, IEnumerable<string> setCookies)
    {
        var cookies = new Dictionary<string, string>(StringComparer.Ordinal);

        if (!string.IsNullOrEmpty(existing))
        {
            foreach (var part in existing.Split(';'))
            {
                var idx = part.IndexOf('=');
                if (idx <= 0)
                    continue;

                var name = part[..idx].Trim();
                var value = part[(idx + 1)..].Trim();
                if (name.Length > 0)
                    cookies[name] = value;
            }
        }

        foreach (var sc in setCookies)
        {
            var idx = sc.IndexOf('=');
            if (idx <= 0)
                continue;

            var name = sc[..idx].Trim();
            var value = sc[(idx + 1)..].Split(';')[0].Trim();
            if (name.Length > 0)
                cookies[name] = value;
        }

        return string.Join("; ", cookies.Select(kv => $"{kv.Key}={kv.Value}"));
    }

    private async Task PersistSetCookiesAsync(Guid? userId, HttpResponseMessage response, CancellationToken ct)
    {
        var setCookies = ExtractSetCookies(response);
        if (userId == null || setCookies.Count == 0)
            return;

        var profile = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
        if (profile == null)
            return;

        var merged = MergeCookieData(UnprotectCookies(profile.DiaryCookieData), setCookies);
        profile.DiaryCookieData = ProtectCookies(merged);
        await _dbContext.SaveChangesAsync(ct);
    }

    private async Task<HttpResponseMessage> SendAsync(Func<HttpRequestMessage> requestFactory, Guid? userIdOverride, CancellationToken ct)
    {
        var userId = userIdOverride ?? TryGetCurrentUserId();
        var cookieHeader = await GetStoredCookieHeaderAsync(userId, ct);

        var request = requestFactory();
        if (!string.IsNullOrEmpty(cookieHeader))
            request.Headers.TryAddWithoutValidation("Cookie", cookieHeader);

        var response = await _httpClient.SendAsync(request, ct);
        await PersistSetCookiesAsync(userId, response, ct);
        return response;
    }

    private async Task<HttpResponseMessage> SendAsync(Func<HttpRequestMessage> requestFactory, CancellationToken ct)
    {
        return await SendAsync(requestFactory, null, ct);
    }

    // Executes an HTTP request and transparently retries once after re-login if
    // the diary session has expired (HTTP 401).
    private async Task<HttpResponseMessage> SendWithReloginAsync(Func<HttpRequestMessage> requestFactory, Guid? userIdOverride, CancellationToken ct)
    {
        var response = await SendAsync(requestFactory, userIdOverride, ct);
        if (response.StatusCode != HttpStatusCode.Unauthorized)
            return response;

        response.Dispose();
        if (!await TryReloginAsync(userIdOverride, ct))
            return await SendAsync(requestFactory, userIdOverride, ct);

        _logger.LogInformation("Diary session expired, re-login succeeded, retrying request");
        return await SendAsync(requestFactory, userIdOverride, ct);
    }

    private async Task<HttpResponseMessage> SendWithReloginAsync(Func<HttpRequestMessage> requestFactory, CancellationToken ct)
    {
        return await SendWithReloginAsync(requestFactory, null, ct);
    }

    // Re-authenticates the current (or overridden) user in the diary using credentials stored during login.
    private async Task<bool> TryReloginAsync(Guid? userIdOverride, CancellationToken ct)
    {
        try
        {
            var userId = userIdOverride ?? TryGetCurrentUserId();
            if (userId == null)
                return false;

            var profile = await _dbContext.StudentProfiles
                .Include(sp => sp.User)
                .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

            if (profile == null || string.IsNullOrEmpty(profile.DiaryPasswordHash))
            {
                _logger.LogWarning("No stored diary credentials for user {UserId}", userId);
                return false;
            }

            var login = !string.IsNullOrEmpty(profile.User.UserName)
                ? profile.User.UserName
                : profile.ExternalStudentId.ToString();

            var passwordHash = _dataProtector.Unprotect(profile.DiaryPasswordHash);

            var result = await LoginWithPrecomputedHashAsync(login, passwordHash, ct);
            if (result == null)
                return false;

            if (!string.IsNullOrEmpty(result.CookieData))
                profile.DiaryCookieData = ProtectCookies(result.CookieData);
            profile.DiaryLastSyncedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Diary re-login failed");
            return false;
        }
    }

    // ---------------------------------------------------------------------
    // Login methods (stateless: they never use per-user cookies; the cookies
    // issued by the diary on a successful login are captured into the result).
    // ---------------------------------------------------------------------

    private async Task<DiaryLoginResult?> LoginRequestAsync(string login, string password, CancellationToken ct)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/services/security/login");
        request.Content = JsonContent.Create(new { login, password, isRemember = false });
        request.Headers.Accept.ParseAdd("application/json, text/plain, */*");

        var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Diary login failed: {StatusCode}", response.StatusCode);
            return null;
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);

        var studentId = ExtractStudentId(doc.RootElement);

        var tenant = doc.RootElement.GetProperty("tenants").EnumerateObject().FirstOrDefault().Value;

        // First/last/middle names are on the tenant level, not on studentRole.
        var tenantFirstName = tenant.TryGetProperty("firstName", out var tF) ? tF.GetString() : null;
        var tenantLastName = tenant.TryGetProperty("lastName", out var tL) ? tL.GetString() : null;
        var tenantMiddleName = tenant.TryGetProperty("middleName", out var tM) ? tM.GetString() : null;

        // Group info comes from studentRole / students list.
        string? groupName = null;
        var studentGroupId = 0;
        if (tenant.TryGetProperty("studentRole", out var sr))
        {
            if (sr.TryGetProperty("studentGroupId", out var sgId))
                studentGroupId = sgId.GetInt32();

            if (sr.TryGetProperty("students", out var students) && students.EnumerateArray().FirstOrDefault().TryGetProperty("groupName", out var gn))
                groupName = gn.GetString();
        }

        // Fall back to the first student entry if the tenant-level names are absent.
        if (string.IsNullOrEmpty(tenantFirstName))
        {
            if (tenant.TryGetProperty("studentRole", out var sr2) &&
                sr2.TryGetProperty("students", out var students2) &&
                students2.EnumerateArray().FirstOrDefault().TryGetProperty("firstName", out var f))
            {
                tenantFirstName = f.GetString();
            }
        }

        var cookieData = MergeCookieData(null, ExtractSetCookies(response));

        return new DiaryLoginResult(
            StudentId: studentId ?? 0,
            FirstName: tenantFirstName ?? "",
            LastName: tenantLastName ?? "",
            MiddleName: tenantMiddleName ?? "",
            OrganizationName: tenant.TryGetProperty("settings", out var settings)
                ? settings.GetProperty("organization").GetProperty("name").GetString() ?? ""
                : "",
            OrganizationShortName: settings.GetProperty("organization").GetProperty("shortName").GetString() ?? "",
            GroupName: groupName,
            StudentGroupId: studentGroupId,
            CookieData: string.IsNullOrWhiteSpace(cookieData) ? null : cookieData
        );
    }

    // Legacy method - kept for compatibility (sends the raw password; the diary
    // expects a SHA-256 base64 hash, so use LoginWithPrecomputedHashAsync).
    public async Task<DiaryLoginResult?> LoginAsync(string login, string password, CancellationToken ct = default)
    {
        return await LoginRequestAsync(login, password, ct);
    }

    // Login with pre-computed SHA256 (base64) hash of the password
    public async Task<DiaryLoginResult?> LoginWithPrecomputedHashAsync(string login, string passwordHash, CancellationToken ct = default)
    {
        return await LoginRequestAsync(login, passwordHash, ct);
    }

    // Relogin using stored credentials
    public async Task<bool> ReloginAsync(string login, string passwordHash, CancellationToken ct = default)
    {
        return await LoginRequestAsync(login, passwordHash, ct) != null;
    }

    public async Task<ScheduleDayDto[]> GetScheduleAsync(int studentId, DateTime startDate, DateTime endDate, CancellationToken ct = default)
    {
        var start = startDate.ToString("yyyy-MM-dd");
        var end = endDate.ToString("yyyy-MM-dd");

        var response = await SendWithReloginAsync(
            () => new HttpRequestMessage(HttpMethod.Get, $"/services/students/{studentId}/lessons/{start}/{end}"),
            ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Get schedule failed: {StatusCode}", response.StatusCode);
            return Array.Empty<ScheduleDayDto>();
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        return ParseSchedule(json);
    }

    public async Task<ScheduleDayDto?> GetScheduleForDayAsync(int studentId, DateTime date, CancellationToken ct = default)
    {
        var schedule = await GetScheduleAsync(studentId, date, date, ct);
        return schedule.FirstOrDefault();
    }

    private ScheduleDayDto[] ParseSchedule(string json)
    {
        var doc = JsonDocument.Parse(json);
        var result = new List<ScheduleDayDto>();

        foreach (var dayElement in doc.RootElement.EnumerateArray())
        {
            var date = dayElement.GetProperty("date").GetDateTime();
            var isHoliday = dayElement.GetProperty("isHoliday").GetBoolean();
            var isShort = dayElement.GetProperty("isShort").GetBoolean();

            var lessons = new List<LessonDto>();
            if (dayElement.TryGetProperty("lessons", out var lessonsElement))
            {
                foreach (var lessonElement in lessonsElement.EnumerateArray())
                {
                    var lesson = ParseLesson(lessonElement);
                    if (lesson != null)
                        lessons.Add(lesson);
                }
            }

            result.Add(new ScheduleDayDto(date, isHoliday, isShort, lessons.ToArray()));
        }

        return result.ToArray();
    }

    private LessonDto? ParseLesson(JsonElement element)
    {
        try
        {
            var startTime = TimeSpan.Parse(element.GetProperty("startTime").GetString() ?? "00:00");
            var endTime = TimeSpan.Parse(element.GetProperty("endTime").GetString() ?? "00:00");
            var name = element.GetProperty("name").GetString() ?? "";

            ClassroomDto? classroom = null;
            if (element.TryGetProperty("timetable", out var timetable) &&
                timetable.TryGetProperty("classroom", out var classroomElement))
            {
                classroom = new ClassroomDto(
                    classroomElement.GetProperty("buildingName").GetString() ?? "",
                    classroomElement.GetProperty("buildingId").GetInt32(),
                    classroomElement.GetProperty("name").GetString() ?? "",
                    classroomElement.GetProperty("id").GetInt32()
                );
            }

            TeacherDto? teacher = null;
            if (element.TryGetProperty("timetable", out var timetable2) &&
                timetable2.TryGetProperty("teacher", out var teacherElement))
            {
                teacher = new TeacherDto(
                    teacherElement.GetProperty("firstName").GetString() ?? "",
                    teacherElement.GetProperty("lastName").GetString() ?? "",
                    teacherElement.GetProperty("middleName").GetString() ?? "",
                    teacherElement.GetProperty("id").GetInt32()
                );
            }

            GradebookDto? gradebook = null;
            if (element.TryGetProperty("gradebook", out var gradebookElement))
            {
                var themes = Array.Empty<string>();
                if (gradebookElement.TryGetProperty("themes", out var themesElement))
                {
                    themes = themesElement.EnumerateArray().Select(t => t.GetString() ?? "").ToArray();
                }

                var tasks = Array.Empty<TaskDto>();
                if (gradebookElement.TryGetProperty("tasks", out var tasksElement))
                {
                    tasks = tasksElement.EnumerateArray().Select(t => new TaskDto(
                        t.GetProperty("id").GetInt32(),
                        t.GetProperty("type").GetString() ?? "",
                        t.GetProperty("topic").GetString() ?? "",
                        t.GetProperty("isRequired").GetBoolean(),
                        t.TryGetProperty("condition", out var cond) ? cond.GetString() : null,
                        t.TryGetProperty("attachments", out var att) 
                            ? att.EnumerateArray().Select(a => new AttachmentDto(
                                a.GetProperty("id").GetInt32(),
                                a.GetProperty("name").GetString() ?? "",
                                a.GetProperty("url").GetString() ?? ""
                            )).ToArray()
                            : Array.Empty<AttachmentDto>()
                    )).ToArray();
                }

                gradebook = new GradebookDto(
                    gradebookElement.GetProperty("id").GetInt32(),
                    themes,
                    gradebookElement.GetProperty("lessonType").GetString() ?? "",
                    tasks
                );
            }

            return new LessonDto(startTime, endTime, name, classroom, teacher, gradebook);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse lesson");
            return null;
        }
    }

    public async Task<SubjectGradeDto[]> GetDashboardAsync(int studentId, CancellationToken ct = default)
    {
        var response = await SendWithReloginAsync(
            () => new HttpRequestMessage(HttpMethod.Get, $"/services/students/{studentId}/dashboard"),
            ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Get dashboard failed: {StatusCode}", response.StatusCode);
            return Array.Empty<SubjectGradeDto>();
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        return ParseDashboard(json);
    }

    public async Task<SubjectGradeDto[]> GetDashboardForUserAsync(Guid userId, int studentId, CancellationToken ct = default)
    {
        var response = await SendWithReloginAsync(
            () => new HttpRequestMessage(HttpMethod.Get, $"/services/students/{studentId}/dashboard"),
            userId,
            ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Get dashboard for user failed: {StatusCode}", response.StatusCode);
            return Array.Empty<SubjectGradeDto>();
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        return ParseDashboard(json);
    }

    private static SubjectGradeDto[] ParseDashboard(string json)
    {
        var doc = JsonDocument.Parse(json);

        var subjects = new List<SubjectGradeDto>();
        if (doc.RootElement.TryGetProperty("subjects", out var subjectsElement))
        {
            foreach (var subject in subjectsElement.EnumerateArray())
            {
                subjects.Add(new SubjectGradeDto(
                    subject.GetProperty("id").GetInt32(),
                    subject.GetProperty("name").GetString() ?? "",
                    subject.GetProperty("mark").GetDouble()
                ));
            }
        }

        return subjects.ToArray();
    }

    public async Task<PerformanceDto?> GetPerformanceAsync(int studentId, CancellationToken ct = default)
    {
        var response = await SendWithReloginAsync(
            () => new HttpRequestMessage(HttpMethod.Get, $"/services/reports/current/performance/{studentId}"),
            ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Get performance failed: {StatusCode}", response.StatusCode);
            return null;
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        return ParsePerformance(json);
    }

    private PerformanceDto? ParsePerformance(string json)
    {
        try
        {
            var doc = JsonDocument.Parse(json);

            var monthsWithDays = Array.Empty<MonthWithDaysDto>();
            if (doc.RootElement.TryGetProperty("monthsWithDays", out var monthsElement))
            {
                monthsWithDays = monthsElement.EnumerateArray().Select(m => new MonthWithDaysDto(
                    new MonthDto(
                        m.GetProperty("month").GetProperty("num").GetInt32(),
                        m.GetProperty("month").GetProperty("name").GetString() ?? ""
                    ),
                    m.GetProperty("daysWithLessons").EnumerateArray().Select(d => d.GetDateTime()).ToArray()
                )).ToArray();
            }

            var subjectPerformances = Array.Empty<SubjectPerformanceDto>();
            if (doc.RootElement.TryGetProperty("daysWithMarksForSubject", out var subjectsElement))
            {
                subjectPerformances = subjectsElement.EnumerateArray().Select(s => new SubjectPerformanceDto(
                    s.GetProperty("subjectName").GetString() ?? "",
                    s.TryGetProperty("daysWithMarks", out var daysElement) 
                        ? daysElement.EnumerateArray().Select(d => new DayWithMarksDto(
                            d.GetProperty("day").GetDateTime(),
                            d.TryGetProperty("markValues", out var marksElement)
                                ? marksElement.EnumerateArray().Select(m => m.GetString() ?? "").ToArray()
                                : Array.Empty<string>(),
                            d.TryGetProperty("absenceType", out var abs) ? abs.GetString() : null
                        )).ToArray()
                        : Array.Empty<DayWithMarksDto>(),
                    s.TryGetProperty("averageMark", out var avg) ? avg.GetDouble() : 0
                )).ToArray();
            }

            return new PerformanceDto(monthsWithDays, subjectPerformances);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse performance");
            return null;
        }
    }

    public async Task<AccountSettingsDto?> GetAccountSettingsAsync(CancellationToken ct = default)
    {
        var response = await SendWithReloginAsync(
            () => new HttpRequestMessage(HttpMethod.Get, "/services/security/account-settings"),
            ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Get account settings failed: {StatusCode}", response.StatusCode);
            return null;
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);

        var persons = Array.Empty<PersonDto>();
        if (doc.RootElement.TryGetProperty("persons", out var personsElement))
        {
            persons = personsElement.EnumerateArray().Select(p => new PersonDto(
                p.GetProperty("email").GetString() ?? "",
                p.GetProperty("isEsiaBound").GetBoolean(),
                p.GetProperty("login").GetString() ?? "",
                p.GetProperty("phone").GetString() ?? "",
                p.GetProperty("orgName").GetString() ?? "",
                p.GetProperty("orgId").GetString() ?? "",
                p.GetProperty("birthday").GetDateTime(),
                p.GetProperty("firstName").GetString() ?? "",
                p.GetProperty("id").GetInt32(),
                p.GetProperty("lastName").GetString() ?? "",
                p.GetProperty("middleName").GetString() ?? "",
                p.GetProperty("trusted").GetBoolean()
            )).ToArray();
        }

        return new AccountSettingsDto(
            doc.RootElement.GetProperty("esiaBound").GetBoolean(),
            persons
        );
    }

    private int? ExtractStudentId(JsonElement root)
    {
        if (root.TryGetProperty("tenants", out var tenants))
        {
            foreach (var tenant in tenants.EnumerateObject())
            {
                if (tenant.Value.TryGetProperty("studentRole", out var studentRole) &&
                    studentRole.TryGetProperty("id", out var id))
                {
                    return id.GetInt32();
                }
            }
        }
        return null;
    }
}