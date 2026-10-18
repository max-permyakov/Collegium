using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class AssignmentService : IAssignmentService
{
    private readonly CollegePortalDbContext _dbContext;
    private readonly ILogger<AssignmentService> _logger;

    public AssignmentService(CollegePortalDbContext dbContext, ILogger<AssignmentService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<AssignmentListDto[]> GetForStudentAsync(Guid userId, CancellationToken ct = default)
    {
        var studentProfile = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Include(sp => sp.StudyGroup)
            .FirstOrDefaultAsync(sp => sp.UserId == userId, ct);

        if (studentProfile == null)
        {
            _logger.LogWarning("Student profile not found for user {UserId}", userId);
            return Array.Empty<AssignmentListDto>();
        }

        return await _dbContext.Assignments
            .AsNoTracking()
            .Where(a => a.StudyGroupId == studentProfile.StudyGroupId)
            .Include(a => a.StudyGroup)
            .Include(a => a.CreatedBy)
            .OrderBy(a => a.DueAt)
            .Select(a => new AssignmentListDto(
                a.Id,
                a.Title,
                a.Description,
                a.DueAt,
                a.StudyGroup.Name,
                a.CreatedBy.DisplayName,
                a.CreatedAt
            ))
            .ToArrayAsync(ct);
    }

    public async Task<AssignmentDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var assignment = await _dbContext.Assignments
            .AsNoTracking()
            .Include(a => a.StudyGroup)
            .Include(a => a.CreatedBy)
            .FirstOrDefaultAsync(a => a.Id == id, ct);

        if (assignment == null)
            return null;

        return new AssignmentDto(
            assignment.Id,
            assignment.Title,
            assignment.Description,
            assignment.DueAt,
            assignment.StudyGroupId,
            assignment.StudyGroup.Name,
            assignment.CreatedById,
            assignment.CreatedBy.DisplayName,
            assignment.CreatedAt,
            assignment.UpdatedAt
        );
    }

    public async Task<AssignmentDto> CreateAsync(Guid createdById, CreateAssignmentDto dto, CancellationToken ct = default)
    {
        var studyGroup = await _dbContext.StudyGroups.FindAsync(dto.StudyGroupId, ct);
        if (studyGroup == null)
            throw new ArgumentException("Study group not found");

        var assignment = new Assignment
        {
            Id = Guid.NewGuid(),
            Title = dto.Title,
            Description = dto.Description,
            DueAt = dto.DueAt,
            StudyGroupId = dto.StudyGroupId,
            CreatedById = createdById,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Assignments.Add(assignment);
        await _dbContext.SaveChangesAsync(ct);

        var creator = await _dbContext.Users.FindAsync(createdById, ct);

        return new AssignmentDto(
            assignment.Id,
            assignment.Title,
            assignment.Description,
            assignment.DueAt,
            assignment.StudyGroupId,
            studyGroup.Name,
            assignment.CreatedById,
            creator?.DisplayName ?? "",
            assignment.CreatedAt,
            assignment.UpdatedAt
        );
    }

    public async Task<AssignmentDto?> UpdateAsync(Guid id, Guid createdById, UpdateAssignmentDto dto, CancellationToken ct = default)
    {
        var assignment = await _dbContext.Assignments
            .Include(a => a.StudyGroup)
            .Include(a => a.CreatedBy)
            .FirstOrDefaultAsync(a => a.Id == id, ct);

        if (assignment == null)
            return null;

        if (assignment.CreatedById != createdById)
        {
            var canModerate = await CanModerateAsync(createdById, ct);
            if (!canModerate)
                return null;
        }

        var studyGroup = await _dbContext.StudyGroups.FindAsync(dto.StudyGroupId, ct);
        if (studyGroup == null)
            throw new ArgumentException("Study group not found");

        assignment.Title = dto.Title;
        assignment.Description = dto.Description;
        assignment.DueAt = dto.DueAt;
        assignment.StudyGroupId = dto.StudyGroupId;
        assignment.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);

        return new AssignmentDto(
            assignment.Id,
            assignment.Title,
            assignment.Description,
            assignment.DueAt,
            assignment.StudyGroupId,
            studyGroup.Name,
            assignment.CreatedById,
            assignment.CreatedBy.DisplayName,
            assignment.CreatedAt,
            assignment.UpdatedAt
        );
    }

    public async Task<bool> DeleteAsync(Guid id, Guid createdById, CancellationToken ct = default)
    {
        var assignment = await _dbContext.Assignments.FindAsync(id, ct);
        if (assignment == null)
            return false;

        if (assignment.CreatedById != createdById)
        {
            var canModerate = await CanModerateAsync(createdById, ct);
            if (!canModerate)
                return false;
        }

        _dbContext.Assignments.Remove(assignment);
        await _dbContext.SaveChangesAsync(ct);
        return true;
    }

    // Editing/deleting someone else's assignment is allowed for full admins
    // and for users granted the AssignmentsManage permission.
    private async Task<bool> CanModerateAsync(Guid userId, CancellationToken ct)
    {
        var user = await _dbContext.Users.FindAsync(userId, ct);
        if (user == null)
            return false;

        var isAdmin = await _dbContext.UserRoles.AnyAsync(
            ur => ur.UserId == userId && ur.RoleId == _dbContext.Roles
                .Where(r => r.Name == "Admin")
                .Select(r => r.Id)
                .FirstOrDefault(), ct);
        if (isAdmin)
            return true;

        return await _dbContext.UserPermissions.AnyAsync(
            up => up.UserId == userId && up.Permission == Domain.Enums.Permission.AssignmentsManage, ct);
    }
}