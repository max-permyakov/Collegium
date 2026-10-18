using System.Text.RegularExpressions;
using CollegePortal.Application.DTOs;

namespace CollegePortal.Infrastructure.Services;

public static class KkepikScheduleParser
{
    // Будни: пара 90 минут, перемена 20 минут.
    private static readonly Dictionary<int, (TimeSpan Start, TimeSpan End)> WeekdayPairTimes = new()
    {
        [1] = (new TimeSpan(8, 45, 0), new TimeSpan(10, 5, 0)),
        [2] = (new TimeSpan(10, 25, 0), new TimeSpan(11, 45, 0)),
        [3] = (new TimeSpan(12, 5, 0), new TimeSpan(13, 25, 0)),
        [4] = (new TimeSpan(13, 35, 0), new TimeSpan(14, 55, 0)),
        [5] = (new TimeSpan(15, 5, 0), new TimeSpan(16, 25, 0)),
        [6] = (new TimeSpan(16, 35, 0), new TimeSpan(17, 55, 0))
      
    };

    // Суббота: пара 90 минут, перемена 10 минут.
    private static readonly Dictionary<int, (TimeSpan Start, TimeSpan End)> SaturdayPairTimes = new()
    {
        [1] = (new TimeSpan(8, 45, 0), new TimeSpan(10, 0, 0)),
        [2] = (new TimeSpan(10, 10, 0), new TimeSpan(11, 25, 0)),
        [3] = (new TimeSpan(11, 35, 0), new TimeSpan(12, 50, 0)),
        [4] = (new TimeSpan(13, 0, 0), new TimeSpan(14, 15, 0)),
        [5] = (new TimeSpan(15, 25, 0), new TimeSpan(16, 55, 0)),
        [6] = (new TimeSpan(17, 5, 0), new TimeSpan(18, 35, 0)),
        [7] = (new TimeSpan(18, 45, 0), new TimeSpan(20, 15, 0))
    };

    public static LessonDto[] Parse(string[] lines, DayOfWeek dayOfWeek)
    {
        var pairTimes = dayOfWeek == DayOfWeek.Saturday ? SaturdayPairTimes : WeekdayPairTimes;
        var lessons = new List<LessonDto>(lines.Length);
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;
            lessons.Add(ParseLine(line, pairTimes));
        }
        return lessons.ToArray();
    }

    public static LessonDto ParseLine(string raw, Dictionary<int, (TimeSpan Start, TimeSpan End)>? pairTimes = null)
    {
        pairTimes ??= WeekdayPairTimes;
        // Trim leading marker glyphs (bullets, variation selectors, dashes, whitespace).
        var line = raw.Trim();
        line = Regex.Replace(line, @"^[^\p{L}\p{N}]+", "").Trim();

        var pairNumber = 0;
        var match = Regex.Match(line, @"^(\d{1,2})\s*пара\b");
        if (match.Success)
        {
            pairNumber = int.Parse(match.Groups[1].Value);
            line = line[match.Length..].Trim();
            line = Regex.Replace(line, @"^[^\p{L}\p{N}]+", "").Trim();
        }

        // Split the remainder into segments separated by any dash variant surrounded by spaces.
        var parts = Regex.Split(line, @"\s+[–—\-]\s+")
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .ToArray();

        var subject = parts.Length > 0 ? parts[0] : line;
        var teacherText = parts.Length > 1 ? parts[1] : "";
        var audience = parts.Length > 2 ? parts[^1] : "";

        pairTimes.TryGetValue(pairNumber, out var times);

        return new LessonDto(
            times.Start,
            times.End,
            subject,
            BuildClassroom(audience),
            BuildTeacher(teacherText),
            null
        );
    }

    private static ClassroomDto? BuildClassroom(string audience)
    {
        if (string.IsNullOrWhiteSpace(audience))
            return null;
        return new ClassroomDto("", 0, audience.Trim(), 0);
    }

    private static TeacherDto? BuildTeacher(string teacherText)
    {
        if (string.IsNullOrWhiteSpace(teacherText))
            return null;

        var normalized = teacherText.Trim().Replace("  ", " ");
        var spaceIndex = normalized.IndexOf(' ');
        if (spaceIndex <= 0)
            return new TeacherDto("", teacherText, "", 0);

        var lastName = normalized[..spaceIndex];
        var initials = normalized[spaceIndex..].Trim();

        var firstName = "";
        var middleName = "";
        var firstDot = initials.IndexOf('.');
        if (firstDot >= 0)
        {
            firstName = initials[..firstDot] + ".";
            initials = initials[(firstDot + 1)..].Trim();
            var secondDot = initials.IndexOf('.');
            if (secondDot >= 0)
                middleName = initials[..secondDot] + ".";
            else if (initials.Length > 0)
                middleName = initials + ".";
        }
        else
        {
            firstName = initials;
        }

        return new TeacherDto(firstName, lastName, middleName, 0);
    }
}