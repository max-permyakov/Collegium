namespace CollegePortal.Infrastructure.Notifications;

/// <summary>
/// Reduces a notification URL and the location the browser is on to the same
/// "section" key. Opening a section directly then retires the notifications
/// that point at it, so the bell link is not the only way to read them.
/// </summary>
public static class NotificationUrlMatcher
{
    private const string ClubUrlPrefix = "/clubs/";
    private const string ClubChatUrlPrefix = "/chats/club/";

    /// <summary>A page path plus the tab that was opened within it.</summary>
    public readonly record struct Section(string Path, string? Tab);

    /// <summary>
    /// Parses a relative SPA path. Absolute and protocol-relative URLs return
    /// null: they can never match a section of this app.
    /// </summary>
    public static Section? Parse(string? url)
    {
        var raw = url?.Trim();
        if (string.IsNullOrEmpty(raw) ||
            raw.Length > 500 ||
            !raw.StartsWith('/') ||
            raw.Contains('\\') ||
            raw.StartsWith("//", StringComparison.Ordinal))
        {
            return null;
        }

        var queryIndex = raw.IndexOf('?');
        var path = (queryIndex < 0 ? raw : raw[..queryIndex]);
        var query = queryIndex < 0 ? string.Empty : raw[(queryIndex + 1)..];

        // A route fragment never changes which section the URL points at.
        var hashIndex = path.IndexOf('#');
        if (hashIndex >= 0)
            path = path[..hashIndex];

        path = path.TrimEnd('/');

        if (path.Length == 0)
            path = "/";

        // The club chat lives at /chats/club/{id}; older links still point at
        // /clubs/{id}, so both spellings must collapse to one section.
        if (path.StartsWith(ClubUrlPrefix, StringComparison.OrdinalIgnoreCase) &&
            path.Length > ClubUrlPrefix.Length)
        {
            path = ClubChatUrlPrefix + path[ClubUrlPrefix.Length..];
        }

        return new Section(path, ReadTab(query));
    }

    /// <summary>
    /// True when the notification belongs to the section the user opened.
    /// A page-wide notification has no tab and matches any of its tabs; a
    /// tab-scoped one (e.g. "/profile?tab=referrals") needs that exact tab.
    /// </summary>
    public static bool MatchesSection(string? notificationUrl, string? openedUrl)
    {
        if (Parse(notificationUrl) is not { } target || Parse(openedUrl) is not { } opened)
            return false;

        if (!string.Equals(target.Path, opened.Path, StringComparison.OrdinalIgnoreCase))
            return false;

        return target.Tab is null ||
            string.Equals(target.Tab, opened.Tab, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Paths that can carry <paramref name="section"/>: the section itself and
    /// the legacy club spelling. Used to narrow the unread rows in SQL before
    /// the exact comparison runs in memory.
    /// </summary>
    public static string[] CandidatePaths(Section section)
    {
        if (section.Path.StartsWith(ClubChatUrlPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var clubId = section.Path[ClubChatUrlPrefix.Length..];
            return
            [
                section.Path,
                ClubUrlPrefix + clubId
            ];
        }

        return [section.Path];
    }

    private static string? ReadTab(string query)
    {
        foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = part.IndexOf('=');
            if (separator <= 0)
                continue;

            if (!part.AsSpan(0, separator).Equals("tab", StringComparison.OrdinalIgnoreCase))
                continue;

            var value = Uri.UnescapeDataString(part[(separator + 1)..]).Trim();
            return value.Length == 0 ? null : value.ToLowerInvariant();
        }

        return null;
    }
}
