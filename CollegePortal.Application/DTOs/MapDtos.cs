namespace CollegePortal.Application.DTOs;

public record BuildingDto(
    Guid Id,
    string Name,
    string? Description,
    int SortOrder,
    int AuditoriumCount
);

public record TeacherRefDto(
    Guid Id,
    string FullName,
    string? Position
);

public record DisciplineDto(
    Guid Id,
    string Name,
    int AuditoriumCount
);

public record AuditoriumDto(
    Guid Id,
    Guid BuildingId,
    string BuildingName,
    string Number,
    string? DisplayName,
    int? Floor,
    string? LocationHint,
    bool HasComputers,
    double X,
    double Y,
    double Width,
    double Height,
    string[] Disciplines,
    TeacherRefDto[] Teachers
);

public record AuditoriumRefDto(
    Guid Id,
    Guid BuildingId,
    string BuildingName,
    string Number,
    string? DisplayName
);

public record CollegeMapDto(
    int MapWidth,
    int MapHeight,
    BuildingDto[] Buildings,
    AuditoriumDto[] Auditoriums
);

public record MapSearchResultDto(
    string Query,
    AuditoriumRefDto[] Auditoriums
);

public record CreateBuildingDto(
    string Name,
    string? Description,
    int SortOrder
);

public record UpdateBuildingDto(
    string Name,
    string? Description,
    int SortOrder
);

public record CreateAuditoriumDto(
    Guid BuildingId,
    string Number,
    string? DisplayName,
    int? Floor,
    string? LocationHint,
    bool HasComputers,
    double X,
    double Y,
    double Width,
    double Height,
    Guid[] DisciplineIds,
    string[] DisciplineNames,
    Guid[] TeacherIds
);

public record UpdateAuditoriumDto(
    Guid BuildingId,
    string Number,
    string? DisplayName,
    int? Floor,
    string? LocationHint,
    bool HasComputers,
    double X,
    double Y,
    double Width,
    double Height,
    Guid[] DisciplineIds,
    string[] DisciplineNames,
    Guid[] TeacherIds
);

public record MapActionResult(
    bool Success,
    string? Error = null
);
