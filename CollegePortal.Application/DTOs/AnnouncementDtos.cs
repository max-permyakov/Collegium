namespace CollegePortal.Application.DTOs;

public record AnnouncementDto(
    Guid Id,
    string Title,
    string Body,
    DateTime PublishedAt,
    Guid AuthorId,
    string AuthorName,
    bool IsPublished,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    Guid? StudyGroupId,
    string? StudyGroupName
);

public record CreateAnnouncementDto(
    string Title,
    string Body,
    DateTime PublishedAt,
    Guid? StudyGroupId
);

public record UpdateAnnouncementDto(
    string Title,
    string Body,
    DateTime PublishedAt,
    bool IsPublished,
    Guid? StudyGroupId
);

public record AnnouncementListDto(
    Guid Id,
    string Title,
    string Body,
    DateTime PublishedAt,
    string AuthorName,
    bool IsPublished,
    DateTime CreatedAt,
    Guid? StudyGroupId,
    string? StudyGroupName
);