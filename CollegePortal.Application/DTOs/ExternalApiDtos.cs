namespace CollegePortal.Application.DTOs;

public record ScheduleDayDto(
    DateTime Date,
    bool IsHoliday,
    bool IsShort,
    LessonDto[] Lessons
);

public record LessonDto(
    TimeSpan StartTime,
    TimeSpan EndTime,
    string Name,
    ClassroomDto? Classroom,
    TeacherDto? Teacher,
    GradebookDto? Gradebook
);

public record ClassroomDto(
    string BuildingName,
    int BuildingId,
    string Name,
    int Id
);

public record TeacherDto(
    string FirstName,
    string LastName,
    string MiddleName,
    int Id
);

public record GradebookDto(
    int Id,
    string[] Themes,
    string LessonType,
    TaskDto[] Tasks
);

public record TaskDto(
    int Id,
    string Type,
    string Topic,
    bool IsRequired,
    string? Condition,
    AttachmentDto[] Attachments
);

public record AttachmentDto(
    int Id,
    string Name,
    string Url
);

public record SubjectGradeDto(
    int Id,
    string Name,
    double Mark
);

public record PerformanceDto(
    MonthWithDaysDto[] MonthsWithDays,
    SubjectPerformanceDto[] Subjects
);

public record MonthWithDaysDto(
    MonthDto Month,
    DateTime[] DaysWithLessons
);

public record MonthDto(
    int Num,
    string Name
);

public record SubjectPerformanceDto(
    string SubjectName,
    DayWithMarksDto[] DaysWithMarks,
    double AverageMark
);

public record DayWithMarksDto(
    DateTime Day,
    string[] MarkValues,
    string? AbsenceType
);

public record DiaryLoginResult(
    int StudentId,
    string FirstName,
    string LastName,
    string MiddleName,
    string OrganizationName,
    string OrganizationShortName,
    string? GroupName = null,
    int StudentGroupId = 0,
    string? CookieData = null
);

public record AccountSettingsDto(
    bool EsiaBound,
    PersonDto[] Persons
);

public record PersonDto(
    string Email,
    bool IsEsiaBound,
    string Login,
    string Phone,
    string OrgName,
    string OrgId,
    DateTime Birthday,
    string FirstName,
    int Id,
    string LastName,
    string MiddleName,
    bool Trusted
);