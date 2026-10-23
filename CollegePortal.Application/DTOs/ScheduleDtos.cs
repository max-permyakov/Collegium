namespace CollegePortal.Application.DTOs;

public record ScheduleResponseDto(
    DateTime Date,
    bool IsHoliday,
    bool IsShort,
    LessonDto[] Lessons,
    string Source = "diary"
);

public record WeekScheduleResponseDto(
    DateTime StartDate,
    DateTime EndDate,
    ScheduleResponseDto[] Days
);

public record GroupScheduleRequestDto(
    string GroupName,
    DateTime? Date
);

public record KkepikScheduleResponseDto(
    DateTime Date,
    string GroupName,
    LessonDto[] Lessons,
    DateTime? UpdatedAt
);