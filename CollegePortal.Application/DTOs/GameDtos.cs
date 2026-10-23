namespace CollegePortal.Application.DTOs;

public record GameScoreSubmissionRequestDto(
    string Mode,
    int Score
);

public record GameScoreSubmissionDto(
    int Score,
    int PersonalBest,
    bool IsPersonalBest,
    int? Rank
);

public record GameLeaderboardEntryDto(
    Guid UserId,
    string DisplayName,
    int Score,
    int Rank,
    bool IsCurrentUser,
    DateTime AchievedAt
);

public record GameLeaderboardDto(
    string GameId,
    string Mode,
    GameLeaderboardEntryDto[] Entries,
    int? CurrentUserRank,
    int? CurrentUserBest
);
