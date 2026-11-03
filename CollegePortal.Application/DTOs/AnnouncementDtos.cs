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
    string? StudyGroupName,
    string? ImageUrl
);

public record CreateAnnouncementDto(
    string Title,
    string Body,
    DateTime PublishedAt,
    bool IsPublished,
    Guid? StudyGroupId,
    string? ImageUrl
);

public record UpdateAnnouncementDto(
    string Title,
    string Body,
    DateTime PublishedAt,
    bool IsPublished,
    Guid? StudyGroupId,
    string? ImageUrl
);

public record AnnouncementListDto(
    Guid Id,
    string Title,
    string Body,
    DateTime PublishedAt,
    Guid AuthorId,
    string AuthorName,
    string? AuthorAvatar,
    bool IsPublished,
    DateTime CreatedAt,
    Guid? StudyGroupId,
    string? StudyGroupName,
    string? ImageUrl
);

public record NewsImageDto(
    Guid Id,
    string Url
);

public record NewsCommentDto(
    Guid Id,
    Guid AnnouncementId,
    Guid UserId,
    string UserName,
    string? UserAvatar,
    string Text,
    DateTime CreatedAt,
    DateTime? UpdatedAt
);

public record CreateNewsCommentDto(string Text);