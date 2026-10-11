namespace CollegePortal.Application.DTOs;

public record ScheduleResponseDto(
    DateTime Date,
    bool IsHoliday,
    bool IsShort,
    LessonDto[] Lessons
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