namespace CollegePortal.Application.DTOs;

public record RatingEntryDto(
    Guid UserId,
    string DisplayName,
    double? AverageMark,
    bool IsCurrentUser
);

public record GroupRatingDto(
    bool OptedIn,
    string GroupName,
    int GroupSize,
    string[] Subjects,
    string? Subject,
    RatingEntryDto[] Entries
);

public record RatingParticipationRequestDto(
    bool Enabled
);

public record RatingParticipationDto(
    bool OptedIn
);
