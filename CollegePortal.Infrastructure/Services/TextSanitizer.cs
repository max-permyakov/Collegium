using System.Text;
using System.Text.RegularExpressions;

namespace CollegePortal.Infrastructure.Services;

internal static partial class TextSanitizer
{
    [GeneratedRegex("<\\/?[A-Za-z][^>]*>")]
    private static partial Regex HtmlTagRegex();

    public static string Clean(string? value, int maxLength = int.MaxValue)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var text = HtmlTagRegex().Replace(value, string.Empty);

        var builder = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            if (ch == '\r')
                continue;
            if (ch == '\n' || ch == '\t')
            {
                builder.Append(ch);
                continue;
            }
            if (char.IsControl(ch))
                continue;
            builder.Append(ch);
        }

        var result = builder.ToString().Trim();
        return result.Length > maxLength ? result[..maxLength] : result;
    }

    /// <summary>
    /// Chat message body: keeps every printable symbol exactly as typed
    /// (&lt;, &gt;, &amp;, quotes, emoji, combining marks), because the UI renders
    /// message text as plain text and never as HTML. Only characters that are
    /// meaningless in text storage or hostile to logs/JSON/postgres (NUL and
    /// other control characters, except newline/tab) are dropped. Length is
    /// capped as a hard server-side limit.
    /// </summary>
    public static string CleanChat(string? value, int maxLength = int.MaxValue)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (ch == '\0')
                continue;
            if (ch == '\n' || ch == '\t' || !char.IsControl(ch))
                builder.Append(ch);
        }

        var result = builder.ToString().Trim();
        return result.Length > maxLength ? result[..maxLength] : result;
    }
}
