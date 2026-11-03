namespace CollegePortal.Application.DTOs;

public record AchievementsResponseDto(
    AchievementDto[] Achievements
);

public record AchievementDto(
    string Code,
    string Title,
    string Description,
    string Icon,
    bool Unlocked,
    DateTime? UnlockedAt
);
