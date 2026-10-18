using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class AnnouncementService : IAnnouncementService
{
    private readonly CollegePortalDbContext _dbContext;
    private readonly ILogger<AnnouncementService> _logger;

    public AnnouncementService(CollegePortalDbContext dbContext, ILogger<AnnouncementService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<AnnouncementListDto[]> GetPublishedAsync(Guid? studyGroupId = null, CancellationToken ct = default)
    {
        IQueryable<Announcement> query = _dbContext.Announcements
            .AsNoTracking()
            .Where(a => a.IsPublished && a.PublishedAt <= DateTime.UtcNow)
            .Include(a => a.Author)
            .Include(a => a.StudyGroup);

        if (studyGroupId.HasValue)
        {
            query = query.Where(a => a.StudyGroupId == null || a.StudyGroupId == studyGroupId.Value);
        }

        return await query
            .OrderByDescending(a => a.PublishedAt)
            .Select(a => new AnnouncementListDto(
                a.Id,
                a.Title,
                a.Body,
                a.PublishedAt,
                a.AuthorId,
                a.Author.DisplayName,
                a.Author.StudentProfile != null ? a.Author.StudentProfile.AvatarDataUrl : null,
                a.IsPublished,
                a.CreatedAt,
                a.StudyGroupId,
                a.StudyGroup != null ? a.StudyGroup.Name : null
            ))
            .ToArrayAsync(ct);
    }

    public async Task<AnnouncementDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var announcement = await _dbContext.Announcements
            .AsNoTracking()
            .Include(a => a.Author)
            .Include(a => a.StudyGroup)
            .FirstOrDefaultAsync(a => a.Id == id, ct);

        if (announcement == null)
            return null;

        return new AnnouncementDto(
            announcement.Id,
            announcement.Title,
            announcement.Body,
            announcement.PublishedAt,
            announcement.AuthorId,
            announcement.Author.DisplayName,
            announcement.IsPublished,
            announcement.CreatedAt,
            announcement.UpdatedAt,
            announcement.StudyGroupId,
            announcement.StudyGroup?.Name
        );
    }

    public async Task<AnnouncementDto> CreateAsync(Guid authorId, CreateAnnouncementDto dto, CancellationToken ct = default)
    {
        var announcement = new Announcement
        {
            Id = Guid.NewGuid(),
            Title = dto.Title,
            Body = dto.Body,
            PublishedAt = dto.PublishedAt,
            AuthorId = authorId,
            IsPublished = dto.IsPublished,
            StudyGroupId = dto.StudyGroupId,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Announcements.Add(announcement);
        await _dbContext.SaveChangesAsync(ct);

        var author = await _dbContext.Users.FindAsync(authorId, ct);
        var studyGroup = dto.StudyGroupId.HasValue 
            ? await _dbContext.StudyGroups.FindAsync(dto.StudyGroupId.Value, ct)
            : null;

        return new AnnouncementDto(
            announcement.Id,
            announcement.Title,
            announcement.Body,
            announcement.PublishedAt,
            announcement.AuthorId,
            author?.DisplayName ?? "",
            announcement.IsPublished,
            announcement.CreatedAt,
            announcement.UpdatedAt,
            announcement.StudyGroupId,
            studyGroup?.Name
        );
    }

    public async Task<AnnouncementDto?> UpdateAsync(Guid id, Guid authorId, UpdateAnnouncementDto dto, CancellationToken ct = default)
    {
        var announcement = await _dbContext.Announcements
            .Include(a => a.Author)
            .Include(a => a.StudyGroup)
            .FirstOrDefaultAsync(a => a.Id == id, ct);

        if (announcement == null)
            return null;

        if (announcement.AuthorId != authorId)
        {
            var user = await _dbContext.Users.FindAsync(authorId, ct);
            var isAdmin = user != null && await _dbContext.UserRoles
                .AnyAsync(ur => ur.UserId == authorId && ur.RoleId == _dbContext.Roles
                    .Where(r => r.Name == "Admin")
                    .Select(r => r.Id)
                    .FirstOrDefault(), ct);
            
            if (!isAdmin)
                return null;
        }

        announcement.Title = dto.Title;
        announcement.Body = dto.Body;
        announcement.PublishedAt = dto.PublishedAt;
        announcement.IsPublished = dto.IsPublished;
        announcement.StudyGroupId = dto.StudyGroupId;
        announcement.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);

        return new AnnouncementDto(
            announcement.Id,
            announcement.Title,
            announcement.Body,
            announcement.PublishedAt,
            announcement.AuthorId,
            announcement.Author.DisplayName,
            announcement.IsPublished,
            announcement.CreatedAt,
            announcement.UpdatedAt,
            announcement.StudyGroupId,
            announcement.StudyGroup?.Name
        );
    }

    public async Task<bool> DeleteAsync(Guid id, Guid authorId, CancellationToken ct = default)
    {
        var announcement = await _dbContext.Announcements.FindAsync(id, ct);
        if (announcement == null)
            return false;

        if (announcement.AuthorId != authorId)
        {
            var user = await _dbContext.Users.FindAsync(authorId, ct);
            var isAdmin = user != null && await _dbContext.UserRoles
                .AnyAsync(ur => ur.UserId == authorId && ur.RoleId == _dbContext.Roles
                    .Where(r => r.Name == "Admin")
                    .Select(r => r.Id)
                    .FirstOrDefault(), ct);
            
            if (!isAdmin)
                return false;
        }

        _dbContext.Announcements.Remove(announcement);
        await _dbContext.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> TogglePublishedAsync(Guid id, Guid authorId, CancellationToken ct = default)
    {
        var announcement = await _dbContext.Announcements.FindAsync(id, ct);
        if (announcement == null)
            return false;

        if (announcement.AuthorId != authorId)
        {
            var user = await _dbContext.Users.FindAsync(authorId, ct);
            var isAdmin = user != null && await _dbContext.UserRoles
                .AnyAsync(ur => ur.UserId == authorId && ur.RoleId == _dbContext.Roles
                    .Where(r => r.Name == "Admin")
                    .Select(r => r.Id)
                    .FirstOrDefault(), ct);
            
            if (!isAdmin)
                return false;
        }

        announcement.IsPublished = !announcement.IsPublished;
        announcement.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
        return true;
    }
}