namespace CollegePortal.Application.DTOs;

public record CollegeCatalogDto(
    string[] Groups,
    string[] Teachers,
    string[] Audiences
);

public record CollegeScheduleSearchDto(
    string Type,
    string Query,
    DateTime Date,
    CollegeLessonItemDto[] Lessons
);

public record CollegeLessonItemDto(
    TimeSpan StartTime,
    TimeSpan EndTime,
    string Name,
    string? TeacherName,
    string? Audience
);

public record CollegeTeacherDto(
    Guid Id,
    string FullName,
    string? Position,
    string? PageUrl,
    string? Phone,
    string? Email,
    string? PhotoUrl,
    string[] Disciplines,
    DateTime UpdatedAt
);

public record CollegeInfoActionResult(
    bool Success,
    string? Error = null
);