using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class GradesService : IGradesService
{
    private readonly IGradesProvider _gradesProvider;
    private readonly CollegePortalDbContext _dbContext;
    private readonly ILogger<GradesService> _logger;

    public GradesService(
        IGradesProvider gradesProvider,
        CollegePortalDbContext dbContext,
        ILogger<GradesService> logger)
    {
        _gradesProvider = gradesProvider;
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<GradesResponseDto?> GetGradesAsync(Guid userId, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null)
        {
            _logger.LogWarning("Student profile not found for user {UserId}", userId);
            return null;
        }

        var subjects = await _gradesProvider.GetDashboardAsync(studentProfile.ExternalStudentId, ct);
        if (subjects == null || subjects.Length == 0)
        {
            return new GradesResponseDto(Array.Empty<SubjectGradeResponseDto>());
        }

        return new GradesResponseDto(
            subjects.Select(s => new SubjectGradeResponseDto(s.Id, s.Name, s.Mark)).ToArray()
        );
    }

    public async Task<PerformanceDto?> GetPerformanceAsync(Guid userId, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null)
        {
            _logger.LogWarning("Student profile not found for user {UserId}", userId);
            return null;
        }

        return await _gradesProvider.GetPerformanceAsync(studentProfile.ExternalStudentId, ct);
    }
}