using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CollegePortal.Infrastructure.Services;

/// <summary>
/// Lazy achievement engine. Every profile request re-evaluates the fixed
/// catalog below against persisted data and inserts a <see cref="UserAchievement"/>
/// row the first time a condition holds (with the current moment as UnlockedAt).
/// </summary>
public class AchievementService : IAchievementService
{
    private readonly CollegePortalDbContext _dbContext;

    public AchievementService(CollegePortalDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<AchievementDto>> GetForUserAsync(Guid userId, CancellationToken ct = default)
    {
        var unlockedAt = DateTime.UtcNow;

        var messageCount = await _dbContext.ChatMessages
            .AsNoTracking()
            .CountAsync(m => m.SenderId == userId && m.DeletedAt == null, ct);

        var clubCount = await _dbContext.ClubMembers
            .AsNoTracking()
            .Where(m => m.UserId == userId)
            .Select(m => m.ClubId)
            .Distinct()
            .CountAsync(ct);

        var bestGameScore = await _dbContext.GameScores
            .AsNoTracking()
            .Where(s => s.UserId == userId)
            .MaxAsync(s => (int?)s.Score, ct) ?? 0;

        var averageMark = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Where(sp => sp.UserId == userId)
            .Select(sp => sp.AverageMark)
            .FirstOrDefaultAsync(ct);

        var definitions = BuildCatalog(messageCount, clubCount, bestGameScore, averageMark);

        var existing = await _dbContext.UserAchievements
            .Where(a => a.UserId == userId)
            .ToDictionaryAsync(a => a.Code, ct);

        var toInsert = definitions
            .Where(d => d.Satisfied && !existing.ContainsKey(d.Code))
            .Select(d => new UserAchievement
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Code = d.Code,
                UnlockedAt = unlockedAt
            })
            .ToList();

        if (toInsert.Count > 0)
        {
            _dbContext.UserAchievements.AddRange(toInsert);
            await _dbContext.SaveChangesAsync(ct);
            foreach (var inserted in toInsert)
                existing[inserted.Code] = inserted;
        }

        return definitions
            .Select(d =>
            {
                var record = existing.TryGetValue(d.Code, out var rec) ? rec : null;
                return new AchievementDto(
                    d.Code,
                    d.Title,
                    d.Description,
                    d.Icon,
                    Unlocked: record != null,
                    UnlockedAt: record?.UnlockedAt
                );
            })
            .ToArray();
    }

    private sealed record Definition(string Code, string Title, string Description, string Icon, bool Satisfied);

    private static Definition[] BuildCatalog(int messageCount, int clubCount, int bestGameScore, decimal? averageMark)
    {
        var avg = averageMark ?? 0m;
        return
        [
            new Definition("welcome", "Добро пожаловать",
                "Аккаунт в портале создан", "🎉", Satisfied: true),
            new Definition("first_message", "Первое слово",
                "Первое сообщение в чате", "💬", Satisfied: messageCount >= 1),
            new Definition("chatter_25", "Болтун",
                "25 сообщений в чатах", "🗣", Satisfied: messageCount >= 25),
            new Definition("chatter_100", "Душа переписки",
                "100 сообщений в чатах", "🏆", Satisfied: messageCount >= 100),
            new Definition("good_student", "Хорошист",
                "Средний балл 4.0 и выше", "📗", Satisfied: avg >= 4.0m),
            new Definition("great_student", "Отличник",
                "Средний балл 4.5 и выше", "📘", Satisfied: avg >= 4.5m),
            new Definition("ideal_student", "Идеал",
                "Идеальный средний балл 5.00", "💎", Satisfied: avg >= 5.0m),
            new Definition("club_member", "Активист",
                "Вступление в один из кружков", "🎭", Satisfied: clubCount >= 1),
            new Definition("gamer", "Геймер",
                "Результат в игровой зоне портала", "🎮", Satisfied: bestGameScore > 0),
            new Definition("omnivorous", "Энтузиаст",
                "Участие в трёх кружках и больше", "🚀", Satisfied: clubCount >= 3)
        ];
    }
}
