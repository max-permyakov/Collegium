using System.Net;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CollegePortal.Infrastructure.ExternalApis.Gosuslugi;

public class GosuslugiOptions
{
    public string BaseUrl { get; set; } = "https://krd-kkep.gosuslugi.ru";
    public int TimeoutSeconds { get; set; } = 20;
}

public record GosuslugiStaffItem(
    string FullName,
    string Position,
    string? PageUrl,
    string? Phone,
    string? Email,
    string? PhotoUrl
);

public partial class GosuslugiStaffClient
{
    private static readonly Regex CardSplitRegex = new(
        @"(?=<div\s+class=""gw-vertical-person-card(?![_\w]))", RegexOptions.Compiled);

    private static readonly Regex CardHrefRegex = new(
        @"href=""([^""]+\.html)""", RegexOptions.Compiled);

    private static readonly Regex NameRegex = new(
        @"class=""[^""]*gw-vertical-person-card__name[^""]*""[^>]*>\s*([^<]+?)\s*</a>", RegexOptions.Compiled);

    private static readonly Regex PositionRegex = new(
        @"class=""[^""]*gw-vertical-person-card__subtitle[^""]*""[^>]*>\s*([^<]*?)\s*</div>", RegexOptions.Compiled);

    private static readonly Regex PhoneRegex = new(
        @"href=""tel:([^""]+)""", RegexOptions.Compiled);

    private static readonly Regex EmailRegex = new(
        @"href=""mailto:([^""]+)""", RegexOptions.Compiled);

    private static readonly Regex PhotoRegex = new(
        @"class=""[^""]*gw-vertical-person-card__img[^""]*""[^>]*src=""([^""]+)""", RegexOptions.Compiled);

    private const int PageSize = 12;
    private const int MaxPos = 1200;

    private readonly HttpClient _httpClient;
    private readonly GosuslugiOptions _options;
    private readonly ILogger<GosuslugiStaffClient> _logger;

    public GosuslugiStaffClient(
        HttpClient httpClient,
        IOptions<GosuslugiOptions> options,
        ILogger<GosuslugiStaffClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<IReadOnlyList<GosuslugiStaffItem>> GetAllStaffAsync(CancellationToken ct)
    {
        var result = new Dictionary<string, GosuslugiStaffItem>(StringComparer.OrdinalIgnoreCase);
        var position = 0;

        while (position <= MaxPos)
        {
            var items = await GetStaffPageAsync(position, ct);
            if (items.Count == 0)
                break;

            var added = false;
            foreach (var item in items)
            {
                if (result.TryAdd(item.FullName, item))
                    added = true;
            }

            if (!added)
                break;

            position += PageSize;
        }

        return result.Values.ToArray();
    }

    private async Task<IReadOnlyList<GosuslugiStaffItem>> GetStaffPageAsync(int position, CancellationToken ct)
    {
        var url = $"{_options.BaseUrl}/o-nas/sotrudniki/sotrudniki.html?isNaked=1&isAjax=1&curPos={position}";
        var html = await GetHtmlAsync(url, ct);
        if (string.IsNullOrWhiteSpace(html))
            return Array.Empty<GosuslugiStaffItem>();

        var chunks = CardSplitRegex.Split(html).Skip(1);
        var items = new List<GosuslugiStaffItem>();

        foreach (var chunk in chunks)
        {
            var href = CardHrefRegex.Match(chunk).Groups[1].Value;
            if (string.IsNullOrEmpty(href))
                continue;

            var fullName = Clean(NameRegex.Match(chunk).Groups[1].Value);
            if (string.IsNullOrEmpty(fullName))
                continue;

            var positionText = Clean(PositionRegex.Match(chunk).Groups[1].Value);
            var phone = Clean(PhoneRegex.Match(chunk).Groups[1].Value);
            if (string.IsNullOrEmpty(phone))
                phone = null;

            var email = Clean(EmailRegex.Match(chunk).Groups[1].Value);
            if (string.IsNullOrEmpty(email))
                email = null;

            var photo = Clean(PhotoRegex.Match(chunk).Groups[1].Value);
            if (string.IsNullOrEmpty(photo)
                || photo.Contains("placeicons", StringComparison.OrdinalIgnoreCase)
                || photo.Contains("dummy", StringComparison.OrdinalIgnoreCase))
            {
                photo = null;
            }
            else if (photo.StartsWith("/", StringComparison.Ordinal))
            {
                photo = _options.BaseUrl + photo;
            }

            var pageUrl = href.StartsWith("/", StringComparison.Ordinal)
                ? _options.BaseUrl + href
                : href;

            items.Add(new GosuslugiStaffItem(fullName, positionText, pageUrl, phone, email, photo));
        }

        return items;
    }

    private async Task<string?> GetHtmlAsync(string url, CancellationToken ct)
    {
        try
        {
            using var response = await _httpClient.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gosuslugi staff request failed with {Status}", response.StatusCode);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(ct);
            return json;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Gosuslugi staff request error");
            return null;
        }
    }

    private static string Clean(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;
        var decoded = WebUtility.HtmlDecode(value).Trim();
        return Regex.Replace(decoded, @"\s+", " ");
    }
}