namespace CollegePortal.Application.DTOs;

public record AdminUserDto(
    Guid Id,
    string Login,
    string DisplayName,
    string? Email,
    string? PhoneNumber,
    Guid? StudyGroupId,
    string? StudyGroupName,
    int? Course,
    string Role,
    bool IsActive,
    bool IsProtected,
    string HeadmanRole,
    decimal? AverageMark,
    DateTime? GradesCachedAt,
    DateTime? LastLoginAt,
    DateTime? LastActivityAt,
    DateTime CreatedAt
);

public record AdminUsersPageDto(
    AdminUserDto[] Items,
    int Total,
    int Page,
    int PageSize
);

public record StatisticsDto(
    int TotalUsers,
    int OnlineUsers,
    int ActiveUsers,
    int AdminUsers,
    int ProtectedAdmins,
    int TotalGroups,
    int TotalAnnouncements,
    int TotalAssignments,
    StatisticsGroupDto[] Groups,
    StatisticsLoginsDto Logins,
    StatisticsTopStudentDto[] TopStudents
);

public record StatisticsGroupDto(
    Guid Id,
    string Name,
    int Course,
    int StudentCount
);

public record StatisticsLoginsDto(
    int Last7Days,
    int Last30Days
);

public record StatisticsTopStudentDto(
    Guid UserId,
    string DisplayName,
    string GroupName,
    decimal AverageMark
);

public record AuditLogDto(
    Guid Id,
    Guid AdminUserId,
    string AdminName,
    string Action,
    Guid? TargetUserId,
    string? TargetName,
    string Details,
    DateTime CreatedAt
);

public record AdminActionResult(
    bool Success,
    string? Error = null
);

public record UpdateRoleRequestDto(
    string Role
);

public record UpdateIsActiveRequestDto(
    bool IsActive
);

public record UpdateHeadmanRequestDto(
    string HeadmanRole
);