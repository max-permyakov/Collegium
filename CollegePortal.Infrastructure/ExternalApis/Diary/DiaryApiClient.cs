using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
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
    private readonly CookieContainer _cookieContainer = new();
    private int? _cachedStudentId;

    public DiaryApiClient(
        HttpClient httpClient,
        IOptions<DiaryApiOptions> options,
        ILogger<DiaryApiClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;

        var handler = new HttpClientHandler
        {
            CookieContainer = _cookieContainer,
            UseCookies = true,
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
        };

        _httpClient.BaseAddress = new Uri(_options.BaseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds);
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        _httpClient.DefaultRequestHeaders.Accept.ParseAdd("application/json, text/plain, */*");
    }

    public async Task<DiaryLoginResult?> LoginAsync(string login, string password, CancellationToken ct = default)
    {
        var loginData = new
        {
            login,
            password,
            isRemember = false
        };

        var response = await _httpClient.PostAsJsonAsync("/services/security/login", loginData, ct);
        
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Diary login failed: {StatusCode}", response.StatusCode);
            return null;
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);

        var studentId = ExtractStudentId(doc.RootElement);
        if (studentId.HasValue)
        {
            _cachedStudentId = studentId.Value;
        }

        var tenant = doc.RootElement.GetProperty("tenants").EnumerateObject().FirstOrDefault().Value;
        var studentRole = tenant.GetProperty("studentRole");

        return new DiaryLoginResult(
            StudentId: studentId ?? 0,
            FirstName: studentRole.GetProperty("firstName").GetString() ?? "",
            LastName: studentRole.GetProperty("lastName").GetString() ?? "",
            MiddleName: studentRole.GetProperty("middleName").GetString() ?? "",
            OrganizationName: tenant.GetProperty("settings").GetProperty("organization").GetProperty("name").GetString() ?? "",
            OrganizationShortName: tenant.GetProperty("settings").GetProperty("organization").GetProperty("shortName").GetString() ?? ""
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

    public async Task<ScheduleDayDto[]> GetScheduleAsync(int studentId, DateTime startDate, DateTime endDate, CancellationToken ct = default)
    {
        var start = startDate.ToString("yyyy-MM-dd");
        var end = endDate.ToString("yyyy-MM-dd");
        
        var response = await _httpClient.GetAsync($"/services/students/{studentId}/lessons/{start}/{end}", ct);
        
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
        var response = await _httpClient.GetAsync($"/services/students/{studentId}/dashboard", ct);
        
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Get dashboard failed: {StatusCode}", response.StatusCode);
            return Array.Empty<SubjectGradeDto>();
        }

        var json = await response.Content.ReadAsStringAsync(ct);
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
        var response = await _httpClient.GetAsync($"/services/reports/current/performance/{studentId}", ct);
        
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
        var response = await _httpClient.GetAsync("/services/security/account-settings", ct);
        
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
}