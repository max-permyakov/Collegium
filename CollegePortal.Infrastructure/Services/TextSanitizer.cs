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
}
