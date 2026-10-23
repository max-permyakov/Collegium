using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class RatingService : IRatingService
{
    // Diary API calls for the subject ranking are bounded so a large group
    // does not hammer the external service.
    private const int MaxParallelDiaryFetches = 4;

    private readonly CollegePortalDbContext _dbContext;
    private readonly IGradesProvider _gradesProvider;
    private readonly IDiaryApiClient _diaryApiClient;
    private readonly ILogger<RatingService> _logger;

    public RatingService(
        CollegePortalDbContext dbContext,
        IGradesProvider gradesProvider,
        IDiaryApiClient diaryApiClient,
        ILogger<RatingService> logger)
    {
        _dbContext = dbContext;
        _gradesProvider = gradesProvider;
        _diaryApiClient = diaryApiClient;
        _logger = logger;
    }

    public async Task<GroupRatingDto?> GetGroupRatingAsync(Guid userId, string? subject, CancellationToken ct = default)
    {
        var profile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
        if (profile == null || profile.ExternalStudentId == null)
        {
            _logger.LogWarning("Student profile or diary link not found for user {UserId}", userId);
            return null;
        }

        var group = await _dbContext.StudyGroups
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Id == profile.StudyGroupId, ct);

        var participants = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Where(sp => sp.StudyGroupId == profile.StudyGroupId && sp.RatingOptIn && sp.ExternalStudentId != null)
            .Select(sp => new Participant(
                sp.UserId,
                sp.ExternalStudentId!.Value,
                sp.AverageMark,
                sp.User.DisplayName))
            .ToListAsync(ct);

        var groupSize = await _dbContext.StudentProfiles
            .AsNoTracking()
            .CountAsync(sp => sp.StudyGroupId == profile.StudyGroupId, ct);

        var subjectName = string.IsNullOrWhiteSpace(subject) ? null : subject.Trim();
        var subjects = await GetOwnSubjectsAsync(profile.ExternalStudentId.Value, ct);

        var entries = subjectName == null
            ? BuildOverallEntries(participants, userId)
            : await BuildSubjectEntriesAsync(participants, subjectName, userId, ct);

        return new GroupRatingDto(
            profile.RatingOptIn,
            group?.Name ?? string.Empty,
            groupSize,
            subjects,
            subjectName,
            entries);
    }

    public async Task<RatingParticipationDto?> SetParticipationAsync(Guid userId, bool enabled, CancellationToken ct = default)
    {
        var profile = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);
        if (profile == null)
        {
            _logger.LogWarning("Student profile not found for user {UserId}", userId);
            return null;
        }

        if (profile.ExternalStudentId == null)
            return null;

        if (profile.RatingOptIn != enabled)
        {
            profile.RatingOptIn = enabled;
            profile.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(ct);
        }

        return new RatingParticipationDto(profile.RatingOptIn);
    }

    private async Task<string[]> GetOwnSubjectsAsync(int externalStudentId, CancellationToken ct)
    {
        try
        {
            var dashboard = await _gradesProvider.GetDashboardAsync(externalStudentId, ct);
            return dashboard?
                .Select(s => s.Name)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray() ?? Array.Empty<string>();
        }
        catch (Exception ex)
        {
            // The overall ranking still works from the cache when the diary
            // session is expired — the subject picker is simply empty.
            _logger.LogWarning(ex, "Failed to load own subjects for rating");
            return Array.Empty<string>();
        }
    }

    private static RatingEntryDto[] BuildOverallEntries(IReadOnlyList<Participant> participants, Guid currentUserId)
    {
        return participants
            .Where(p => p.AverageMark.HasValue)
            .Select(p => new RatingEntryDto(
                p.UserId,
                ResolveDisplayName(p),
                (double)p.AverageMark!.Value,
                p.UserId == currentUserId))
            .OrderByDescending(e => e.AverageMark ?? 0)
            .ThenBy(e => e.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private async Task<RatingEntryDto[]> BuildSubjectEntriesAsync(
        IReadOnlyList<Participant> participants,
        string subjectName,
        Guid currentUserId,
        CancellationToken ct)
    {
        using var semaphore = new SemaphoreSlim(MaxParallelDiaryFetches);
        var results = new List<RatingEntryDto>(participants.Count);

        var tasks = participants.Select(async p =>
        {
            await semaphore.WaitAsync(ct);
            try
            {
                var dashboard = await _diaryApiClient.GetDashboardForUserAsync(p.UserId, p.ExternalStudentId, ct);
                var match = dashboard?.FirstOrDefault(s =>
                    !string.IsNullOrWhiteSpace(s.Name) &&
                    string.Equals(s.Name.Trim(), subjectName, StringComparison.OrdinalIgnoreCase));
                if (match == null) return;

                lock (results)
                {
                    results.Add(new RatingEntryDto(p.UserId, ResolveDisplayName(p), match.Mark, p.UserId == currentUserId));
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // A student with an expired diary session is skipped rather
                // than failing the whole rating.
                _logger.LogWarning(ex, "Failed to load dashboard for rating participant {UserId}", p.UserId);
            }
            finally
            {
                semaphore.Release();
            }
        });

        await Task.WhenAll(tasks);

        return results
            .OrderByDescending(e => e.AverageMark ?? 0)
            .ThenBy(e => e.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string ResolveDisplayName(Participant p) =>
        string.IsNullOrWhiteSpace(p.DisplayName) ? "Студент" : p.DisplayName;

    private sealed record Participant(Guid UserId, int ExternalStudentId, decimal? AverageMark, string DisplayName);
}
