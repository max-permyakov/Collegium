namespace CollegePortal.Application.DTOs;

public record AssignmentDto(
    Guid Id,
    string Title,
    string Description,
    DateTime DueAt,
    Guid StudyGroupId,
    string StudyGroupName,
    Guid CreatedById,
    string CreatedByName,
    DateTime CreatedAt,
    DateTime? UpdatedAt
);

public record CreateAssignmentDto(
    string Title,
    string Description,
    DateTime DueAt,
    Guid StudyGroupId
);

public record UpdateAssignmentDto(
    string Title,
    string Description,
    DateTime DueAt,
    Guid StudyGroupId
);

public record AssignmentListDto(
    Guid Id,
    string Title,
    string Description,
    DateTime DueAt,
    string StudyGroupName,
    string CreatedByName,
    DateTime CreatedAt
);