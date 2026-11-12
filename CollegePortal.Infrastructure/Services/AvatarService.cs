using CollegePortal.Application.Services;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CollegePortal.Infrastructure.Services;

/// <summary>
/// Decodes the base64 data URLs stored on profiles and clubs into real image
/// responses. See <see cref="IAvatarService"/> for why this exists.
/// </summary>
public class AvatarService : IAvatarService
{
    private readonly CollegePortalDbContext _dbContext;

    public AvatarService(CollegePortalDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<AvatarImage?> GetUserAvatarAsync(Guid userId, CancellationToken ct = default)
    {
        var row = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId && u.IsActive)
            .Select(u => new
            {
                Avatar = u.StudentProfile != null ? u.StudentProfile.AvatarDataUrl : null,
                UpdatedAt = u.StudentProfile != null ? u.StudentProfile.UpdatedAt : null
            })
            .FirstOrDefaultAsync(ct);

        return row == null ? null : Decode(row.Avatar, row.UpdatedAt);
    }

    public async Task<AvatarImage?> GetClubAvatarAsync(Guid clubId, Guid userId, bool isAdmin, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs
            .AsNoTracking()
            .Where(c => c.Id == clubId)
            .Select(c => new
            {
                c.AvatarDataUrl,
                c.IsPrivate,
                c.OwnerId,
                c.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        if (club == null)
            return null;

        // Private club avatars are only visible to members, the owner and admins.
        if (club.IsPrivate && !isAdmin && club.OwnerId != userId)
        {
            var isMember = await _dbContext.ClubMembers
                .AsNoTracking()
                .AnyAsync(m => m.ClubId == clubId && m.UserId == userId, ct);
            if (!isMember)
                return null;
        }

        return Decode(club.AvatarDataUrl, club.UpdatedAt);
    }

    private static AvatarImage? Decode(string? dataUrl, DateTime? updatedAt)
    {
        if (string.IsNullOrWhiteSpace(dataUrl))
            return null;

        var comma = dataUrl.IndexOf(',');
        if (comma < 0)
            return null;

        var header = dataUrl[..comma];
        if (!header.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)
            || !header.Contains(";base64", StringComparison.OrdinalIgnoreCase))
            return null;

        var semicolon = header.IndexOf(';');
        var contentType = semicolon > "data:".Length
            ? header["data:".Length..semicolon]
            : "image/png";

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(dataUrl[(comma + 1)..]);
        }
        catch (FormatException)
        {
            return null;
        }

        if (bytes.Length == 0)
            return null;

        var lastModified = updatedAt.HasValue
            ? new DateTimeOffset(DateTime.SpecifyKind(updatedAt.Value, DateTimeKind.Utc))
            : (DateTimeOffset?)null;

        return new AvatarImage(bytes, contentType, lastModified);
    }
}
