using System.Net.Http.Headers;
using System.Text.Json;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CollegePortal.Infrastructure.ExternalApis.Schedule;

public class ScheduleApiOptions
{
    public string BaseUrl { get; set; } = "https://kkepik.rub1kub.ru/api";
    public int TimeoutSeconds { get; set; } = 10;
}

public class ScheduleApiClient
{
    private readonly HttpClient _httpClient;
    private readonly ScheduleApiOptions _options;
    private readonly ILogger<ScheduleApiClient> _logger;

    public ScheduleApiClient(
        HttpClient httpClient,
        IOptions<ScheduleApiOptions> options,
        ILogger<ScheduleApiClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;

        _httpClient.BaseAddress = new Uri(_options.BaseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds);
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        _httpClient.DefaultRequestHeaders.Accept.ParseAdd("application/json");
    }

    public async Task<string[]> GetGroupsAsync(CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync("/api/groups", ct);
        if (!response.IsSuccessStatusCode) return Array.Empty<string>();

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);
        
        if (doc.RootElement.TryGetProperty("groups", out var groupsElement))
        {
            return groupsElement.EnumerateArray().Select(g => g.GetString() ?? "").Where(g => !string.IsNullOrEmpty(g)).ToArray();
        }
        return Array.Empty<string>();
    }

    public async Task<string[]> GetTeachersAsync(CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync("/api/teachers", ct);
        if (!response.IsSuccessStatusCode) return Array.Empty<string>();

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);
        
        if (doc.RootElement.TryGetProperty("teachers", out var teachersElement))
        {
            return teachersElement.EnumerateArray().Select(t => t.GetString() ?? "").Where(t => !string.IsNullOrEmpty(t)).ToArray();
        }
        return Array.Empty<string>();
    }

    public async Task<string[]> GetAudiencesAsync(CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync("/api/audiences", ct);
        if (!response.IsSuccessStatusCode) return Array.Empty<string>();

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);
        
        if (doc.RootElement.TryGetProperty("audiences", out var audiencesElement))
        {
            return audiencesElement.EnumerateArray().Select(a => a.GetString() ?? "").Where(a => !string.IsNullOrEmpty(a)).ToArray();
        }
        return Array.Empty<string>();
    }

    public async Task<ScheduleResponseDto?> GetGroupScheduleAsync(string group, DateTime? date = null, CancellationToken ct = default)
    {
        var query = $"?group={Uri.EscapeDataString(group)}";
        if (date.HasValue)
        {
            query += $"&date={date.Value:dd.MM.yyyy}";
        }

        var response = await _httpClient.GetAsync($"/api/schedule/group{query}", ct);
        if (!response.IsSuccessStatusCode) return null;

        var json = await response.Content.ReadAsStringAsync(ct);
        return ParseScheduleResponse(json);
    }

    public async Task<ScheduleResponseDto?> GetTeacherScheduleAsync(string teacher, DateTime? date = null, CancellationToken ct = default)
    {
        var query = $"?teacher={Uri.EscapeDataString(teacher)}";
        if (date.HasValue)
        {
            query += $"&date={date.Value:dd.MM.yyyy}";
        }

        var response = await _httpClient.GetAsync($"/api/schedule/teacher{query}", ct);
        if (!response.IsSuccessStatusCode) return null;

        var json = await response.Content.ReadAsStringAsync(ct);
        return ParseScheduleResponse(json);
    }

    public async Task<ScheduleResponseDto?> GetAudienceScheduleAsync(string audience, DateTime? date = null, CancellationToken ct = default)
    {
        var query = $"?audience={Uri.EscapeDataString(audience)}";
        if (date.HasValue)
        {
            query += $"&date={date.Value:dd.MM.yyyy}";
        }

        var response = await _httpClient.GetAsync($"/api/schedule/audience{query}", ct);
        if (!response.IsSuccessStatusCode) return null;

        var json = await response.Content.ReadAsStringAsync(ct);
        return ParseScheduleResponse(json);
    }

    public async Task<CatalogDto?> GetCatalogAsync(CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync("/api/schedule/catalog", ct);
        if (!response.IsSuccessStatusCode) return null;

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);

        if (doc.RootElement.TryGetProperty("groups", out var groupsElement) &&
            doc.RootElement.TryGetProperty("teachers", out var teachersElement) &&
            doc.RootElement.TryGetProperty("audiences", out var audiencesElement))
        {
            return new CatalogDto(
                groupsElement.EnumerateArray().Select(g => g.GetString() ?? "").ToArray(),
                teachersElement.EnumerateArray().Select(t => t.GetString() ?? "").ToArray(),
                audiencesElement.EnumerateArray().Select(a => a.GetString() ?? "").ToArray()
            );
        }

        return null;
    }

    private ScheduleResponseDto? ParseScheduleResponse(string json)
    {
        try
        {
            var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var dateStr = root.GetProperty("date").GetString() ?? "";
            var date = DateTime.TryParseExact(dateStr, "dd.MM.yyyy", null, System.Globalization.DateTimeStyles.None, out var parsedDate) 
                ? parsedDate 
                : DateTime.Today;

            var scheduleLines = Array.Empty<string>();
            if (root.TryGetProperty("schedule", out var scheduleElement))
            {
                scheduleLines = scheduleElement.EnumerateArray().Select(s => s.GetString() ?? "").ToArray();
            }

            return new ScheduleResponseDto(
                date,
                root.TryGetProperty("group", out var g) ? g.GetString() : null,
                root.TryGetProperty("teacher", out var t) ? t.GetString() : null,
                root.TryGetProperty("audience", out var a) ? a.GetString() : null,
                scheduleLines
            );
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse schedule response");
            return null;
        }
    }
}

public record ScheduleResponseDto(
    DateTime Date,
    string? Group,
    string? Teacher,
    string? Audience,
    string[] ScheduleLines
);

public record CatalogDto(
    string[] Groups,
    string[] Teachers,
    string[] Audiences
);