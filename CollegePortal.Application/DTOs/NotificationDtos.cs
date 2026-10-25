namespace CollegePortal.Application.DTOs;

public record NotificationDto(
    Guid Id,
    string Type,
    string Title,
    string Body,
    string? Url,
    bool IsRead,
    DateTime CreatedAt);
