using System.Globalization;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

public class ClubService : IClubService
{
    private const int MaxAvatarDataUrlLength = 3_000_000;
    private const int MaxClubNameLength = 20;
    private const int MaxClubDescriptionLength = 200;
    private const int MaxMessageLength = 1000;
    private const int DefaultMessagesLimit = 100;
    private const int MaxMessagesLimit = 500;

    private readonly CollegePortalDbContext _dbContext;
    private readonly ILogger<ClubService> _logger;

    public ClubService(CollegePortalDbContext dbContext, ILogger<ClubService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<ClubListDto[]> GetVisibleAsync(Guid userId, bool isAdmin, CancellationToken ct = default)
    {
        var query = _dbContext.Clubs.AsNoTracking();

        if (!isAdmin)
        {
            query = query.Where(c => !c.IsPrivate || c.Members.Any(m => m.UserId == userId));
        }

        var rows = await query
            .OrderByDescending(c => c.IsPinned)
            .ThenByDescending(c => c.CreatedAt)
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.Description,
                c.AvatarDataUrl,
                c.IsPrivate,
                c.JoinByLink,
                c.IsPinned,
                c.OwnerId,
                OwnerName = c.Owner.DisplayName,
                MemberCount = c.Members.Count,
                IsMember = c.Members.Any(m => m.UserId == userId),
                IsLeader = c.OwnerId == userId || c.Members.Any(m => m.UserId == userId && m.IsLeader),
                c.CreatedAt
            })
            .ToListAsync(ct);

        return rows.Select(c => new ClubListDto(
            c.Id, c.Name, c.Description, c.AvatarDataUrl, c.IsPrivate, c.JoinByLink, c.IsPinned,
            c.OwnerId, c.OwnerName, c.MemberCount, c.IsMember, c.IsLeader, c.CreatedAt
        )).ToArray();
    }

    public Task<ClubListDto[]> GetAllForAdminAsync(CancellationToken ct = default) =>
        GetVisibleAsync(Guid.Empty, isAdmin: true, ct);

    public Task<ClubDetailDto?> GetAsync(Guid clubId, Guid userId, bool isAdmin, string? inviteToken, CancellationToken ct = default) =>
        BuildDetailAsync(clubId, userId, isAdmin, inviteToken, ct);

    public Task<ClubDetailDto?> GetForAdminAsync(Guid clubId, CancellationToken ct = default) =>
        BuildDetailAsync(clubId, Guid.Empty, isAdmin: true, inviteToken: null, ct);

    private async Task<ClubDetailDto?> BuildDetailAsync(Guid clubId, Guid userId, bool isAdmin, string? inviteToken, CancellationToken ct)
    {
        var club = await _dbContext.Clubs
            .AsNoTracking()
            .Include(c => c.Owner)
            .Include(c => c.Members).ThenInclude(m => m.User).ThenInclude(u => u.StudentProfile)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);

        if (club == null)
            return null;

        var membership = club.Members.FirstOrDefault(m => m.UserId == userId);
        var isMember = membership != null;
        var isLeader = isMember && (membership!.IsLeader || club.OwnerId == userId);

        var validInvite = !string.IsNullOrEmpty(inviteToken)
            && club.JoinByLink
            && string.Equals(inviteToken, club.InviteToken, StringComparison.Ordinal);

        var canView = isAdmin || isMember || !club.IsPrivate || validInvite;
        if (!canView)
            return null;

        var canManage = isAdmin || isLeader;
        var canJoin = !isMember &&
            ((!club.IsPrivate && !club.JoinByLink) || (club.JoinByLink && validInvite));

        var members = club.Members
            .OrderByDescending(m => m.UserId == club.OwnerId)
            .ThenByDescending(m => m.IsLeader)
            .ThenBy(m => m.User.DisplayName)
            .Select(m => new ClubMemberDto(
                m.UserId,
                m.User.DisplayName,
                m.User.StudentProfile?.AvatarDataUrl,
                m.IsLeader || m.UserId == club.OwnerId,
                m.JoinedAt
            ))
            .ToArray();

        return new ClubDetailDto(
            club.Id,
            club.Name,
            club.Description,
            club.AvatarDataUrl,
            club.IsPrivate,
            club.JoinByLink,
            club.IsPinned,
            canManage ? club.InviteToken : null,
            club.OwnerId,
            club.Owner.DisplayName,
            members.Length,
            isMember,
            isLeader,
            canManage,
            canJoin,
            club.CreatedAt,
            members
        );
    }

    public async Task<ClubDetailDto> CreateAsync(Guid userId, CreateClubDto dto, CancellationToken ct = default)
    {
        var name = TextSanitizer.Clean(dto.Name);
        ValidateName(name);
        ValidateAvatar(dto.AvatarDataUrl);

        var description = TextSanitizer.Clean(dto.Description);
        if (description.Length > MaxClubDescriptionLength)
            throw new ArgumentException($"Описание кружка — не более {MaxClubDescriptionLength} символов");

        var club = new Club
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = string.IsNullOrEmpty(description) ? null : description,
            AvatarDataUrl = string.IsNullOrWhiteSpace(dto.AvatarDataUrl) ? null : dto.AvatarDataUrl,
            IsPrivate = dto.IsPrivate,
            JoinByLink = dto.JoinByLink,
            InviteToken = Guid.NewGuid().ToString("N"),
            OwnerId = userId,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Clubs.Add(club);
        _dbContext.ClubMembers.Add(new ClubMember
        {
            Id = Guid.NewGuid(),
            ClubId = club.Id,
            UserId = userId,
            IsLeader = true,
            JoinedAt = DateTime.UtcNow
        });

        await _dbContext.SaveChangesAsync(ct);

        var detail = await BuildDetailAsync(club.Id, userId, isAdmin: false, inviteToken: null, ct);
        return detail!;
    }

    public async Task<ClubActionResult> UpdateAsync(Guid clubId, Guid userId, bool isAdmin, UpdateClubDto dto, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs
            .Include(c => c.Members)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club == null)
            return new ClubActionResult(false, "Группа не найдена");

        if (!await CanManageAsync(club, userId, isAdmin, ct))
            return new ClubActionResult(false, "Недостаточно прав");

        var name = TextSanitizer.Clean(dto.Name);
        if (string.IsNullOrEmpty(name))
            return new ClubActionResult(false, "Название обязательно");
        if (name.Length > MaxClubNameLength)
            return new ClubActionResult(false, $"Название кружка — не более {MaxClubNameLength} символов");
        if (dto.AvatarDataUrl != null && dto.AvatarDataUrl.Length > MaxAvatarDataUrlLength)
            return new ClubActionResult(false, "Фото превышает лимит 2 МБ");
        if (!string.IsNullOrEmpty(dto.AvatarDataUrl) && !dto.AvatarDataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
            return new ClubActionResult(false, "Некорректное изображение");

        var description = TextSanitizer.Clean(dto.Description);
        if (description.Length > MaxClubDescriptionLength)
            return new ClubActionResult(false, $"Описание кружка — не более {MaxClubDescriptionLength} символов");

        club.Name = name;
        club.Description = string.IsNullOrEmpty(description) ? null : description;
        club.AvatarDataUrl = string.IsNullOrWhiteSpace(dto.AvatarDataUrl) ? null : dto.AvatarDataUrl;
        club.IsPrivate = dto.IsPrivate;
        club.JoinByLink = dto.JoinByLink;
        club.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);
        return new ClubActionResult(true);
    }

    public async Task<ClubActionResult> DeleteAsync(Guid clubId, Guid userId, bool isAdmin, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs.FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club == null)
            return new ClubActionResult(false, "Группа не найдена");

        if (!isAdmin && club.OwnerId != userId)
            return new ClubActionResult(false, "Удалить группу может только владелец");

        _dbContext.Clubs.Remove(club);
        await _dbContext.SaveChangesAsync(ct);
        return new ClubActionResult(true);
    }

    public async Task<ClubActionResult> JoinAsync(Guid clubId, Guid userId, string? inviteToken, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs
            .Include(c => c.Members)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club == null)
            return new ClubActionResult(false, "Группа не найдена");

        if (club.Members.Any(m => m.UserId == userId))
            return new ClubActionResult(true);

        if (club.JoinByLink)
        {
            if (string.IsNullOrEmpty(inviteToken) || !string.Equals(inviteToken, club.InviteToken, StringComparison.Ordinal))
                return new ClubActionResult(false, "Для вступления нужна ссылка-приглашение");
        }
        else if (club.IsPrivate)
        {
            return new ClubActionResult(false, "Приватная группа — вступление по приглашению главы");
        }

        _dbContext.ClubMembers.Add(new ClubMember
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            UserId = userId,
            IsLeader = false,
            JoinedAt = DateTime.UtcNow
        });
        await _dbContext.SaveChangesAsync(ct);
        return new ClubActionResult(true);
    }

    public async Task<ClubActionResult> LeaveAsync(Guid clubId, Guid userId, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs.FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club == null)
            return new ClubActionResult(false, "Группа не найдена");

        if (club.OwnerId == userId)
            return new ClubActionResult(false, "Владелец не может покинуть группу — удалите её или передайте права");

        var membership = await _dbContext.ClubMembers
            .FirstOrDefaultAsync(m => m.ClubId == clubId && m.UserId == userId, ct);
        if (membership == null)
            return new ClubActionResult(true);

        _dbContext.ClubMembers.Remove(membership);
        await _dbContext.SaveChangesAsync(ct);
        return new ClubActionResult(true);
    }

    public async Task<ClubActionResult> SetLeaderAsync(Guid clubId, Guid actorId, Guid targetUserId, bool isLeader, bool isAdmin, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs
            .Include(c => c.Members)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club == null)
            return new ClubActionResult(false, "Группа не найдена");

        if (!await CanManageAsync(club, actorId, isAdmin, ct))
            return new ClubActionResult(false, "Недостаточно прав");

        if (targetUserId == club.OwnerId)
            return new ClubActionResult(false, "Владелец всегда глава группы");

        var membership = club.Members.FirstOrDefault(m => m.UserId == targetUserId);
        if (membership == null)
            return new ClubActionResult(false, "Пользователь не состоит в группе");

        membership.IsLeader = isLeader;
        await _dbContext.SaveChangesAsync(ct);
        return new ClubActionResult(true);
    }

    public async Task<ClubActionResult> RemoveMemberAsync(Guid clubId, Guid actorId, Guid targetUserId, bool isAdmin, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs
            .Include(c => c.Members)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club == null)
            return new ClubActionResult(false, "Группа не найдена");

        if (!await CanManageAsync(club, actorId, isAdmin, ct))
            return new ClubActionResult(false, "Недостаточно прав");

        if (targetUserId == club.OwnerId)
            return new ClubActionResult(false, "Нельзя удалить владельца группы");

        var membership = club.Members.FirstOrDefault(m => m.UserId == targetUserId);
        if (membership == null)
            return new ClubActionResult(true);

        _dbContext.ClubMembers.Remove(membership);
        await _dbContext.SaveChangesAsync(ct);
        return new ClubActionResult(true);
    }

    public async Task<ClubMessageDto[]?> GetMessagesAsync(Guid clubId, Guid userId, bool isAdmin, string? after = null, string? before = null, int? latest = null, int? limit = null, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs
            .AsNoTracking()
            .Include(c => c.Members)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club == null)
            return null;

        var isMember = club.Members.Any(m => m.UserId == userId);
        if (!isAdmin && !isMember)
            return null;

        var afterUtc = ParseUtc(after);
        var beforeUtc = ParseUtc(before);

        var query = _dbContext.ClubMessages
            .AsNoTracking()
            .Include(m => m.User).ThenInclude(u => u.StudentProfile)
            .Where(m => m.ClubId == clubId);

        if (afterUtc != null)
            query = query.Where(m => m.CreatedAt > afterUtc);
        if (beforeUtc != null)
            query = query.Where(m => m.CreatedAt < beforeUtc);

        List<ClubMessage> rows;
        if (latest is int takeLatest)
        {
            rows = await query
                .OrderByDescending(m => m.CreatedAt)
                .ThenByDescending(m => m.Id)
                .Take(Math.Clamp(takeLatest, 1, MaxMessagesLimit))
                .ToListAsync(ct);
            rows.Reverse();
        }
        else if (limit.HasValue || afterUtc != null)
        {
            var take = Math.Clamp(limit ?? DefaultMessagesLimit, 1, MaxMessagesLimit);
            if (beforeUtc != null)
            {
                rows = await query
                    .OrderByDescending(m => m.CreatedAt)
                    .ThenByDescending(m => m.Id)
                    .Take(take)
                    .ToListAsync(ct);
                rows.Reverse();
            }
            else
            {
                rows = await query
                    .OrderBy(m => m.CreatedAt)
                    .ThenBy(m => m.Id)
                    .Take(take)
                    .ToListAsync(ct);
            }
        }
        else
        {
            rows = await query
                .OrderBy(m => m.CreatedAt)
                .ThenBy(m => m.Id)
                .ToListAsync(ct);
        }

        return rows.Select(m => new ClubMessageDto(
            m.Id,
            m.ClubId,
            m.UserId,
            m.User.DisplayName,
            m.User.StudentProfile != null ? m.User.StudentProfile.AvatarDataUrl : null,
            m.Text,
            m.CreatedAt,
            m.UpdatedAt
        )).ToArray();
    }

    private static DateTime? ParseUtc(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        if (!DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
            return null;
        return parsed.Kind switch
        {
            DateTimeKind.Utc => parsed,
            DateTimeKind.Local => parsed.ToUniversalTime(),
            _ => DateTime.SpecifyKind(parsed, DateTimeKind.Utc)
        };
    }

    public async Task<ClubMessageDto?> PostMessageAsync(Guid clubId, Guid userId, string text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text))
            return null;

        var trimmed = TextSanitizer.Clean(text, MaxMessageLength);
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        var isMember = await _dbContext.ClubMembers
            .AnyAsync(m => m.ClubId == clubId && m.UserId == userId, ct);
        if (!isMember)
            return null;

        var message = new ClubMessage
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            UserId = userId,
            Text = trimmed,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.ClubMessages.Add(message);
        await _dbContext.SaveChangesAsync(ct);

        var user = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.StudentProfile)
            .FirstOrDefaultAsync(u => u.Id == userId, ct);

        return new ClubMessageDto(
            message.Id,
            message.ClubId,
            message.UserId,
            user?.DisplayName ?? "",
            user?.StudentProfile?.AvatarDataUrl,
            message.Text,
            message.CreatedAt,
            message.UpdatedAt
        );
    }

    public async Task<ClubMessageDto?> UpdateMessageAsync(Guid messageId, Guid userId, bool isAdmin, string text, CancellationToken ct = default)
    {
        var message = await _dbContext.ClubMessages
            .FirstOrDefaultAsync(m => m.Id == messageId, ct);
        if (message == null)
            return null;

        if (!isAdmin && message.UserId != userId)
        {
            var club = await _dbContext.Clubs
                .AsNoTracking()
                .Include(c => c.Members)
                .FirstOrDefaultAsync(c => c.Id == message.ClubId, ct);
            var isLeader = club != null && await CanManageAsync(club, userId, isAdmin: false, ct);
            if (!isLeader)
                return null;
        }

        var trimmed = TextSanitizer.Clean(text, MaxMessageLength);
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        message.Text = trimmed;
        message.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);

        var user = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.StudentProfile)
            .FirstOrDefaultAsync(u => u.Id == message.UserId, ct);

        return new ClubMessageDto(
            message.Id,
            message.ClubId,
            message.UserId,
            user?.DisplayName ?? "",
            user?.StudentProfile?.AvatarDataUrl,
            message.Text,
            message.CreatedAt,
            message.UpdatedAt
        );
    }

    public async Task<ClubActionResult> SetPinnedAsync(Guid clubId, Guid userId, bool isAdmin, bool isPinned, CancellationToken ct = default)
    {
        var club = await _dbContext.Clubs
            .Include(c => c.Members)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club == null)
            return new ClubActionResult(false, "Группа не найдена");

        if (!await CanManageAsync(club, userId, isAdmin, ct))
            return new ClubActionResult(false, "Недостаточно прав");

        club.IsPinned = isPinned;
        club.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
        return new ClubActionResult(true);
    }

    public async Task<ClubActionResult> DeleteMessageAsync(Guid messageId, Guid userId, bool isAdmin, CancellationToken ct = default)
    {
        var message = await _dbContext.ClubMessages
            .FirstOrDefaultAsync(m => m.Id == messageId, ct);
        if (message == null)
            return new ClubActionResult(false, "Сообщение не найдено");

        if (!isAdmin && message.UserId != userId)
        {
            var club = await _dbContext.Clubs
                .AsNoTracking()
                .Include(c => c.Members)
                .FirstOrDefaultAsync(c => c.Id == message.ClubId, ct);
            var isLeader = club != null && await CanManageAsync(club, userId, isAdmin: false, ct);
            if (!isLeader)
                return new ClubActionResult(false, "Недостаточно прав");
        }

        _dbContext.ClubMessages.Remove(message);
        await _dbContext.SaveChangesAsync(ct);
        return new ClubActionResult(true);
    }

    private async Task<bool> CanManageAsync(Club club, Guid userId, bool isAdmin, CancellationToken ct)
    {
        if (isAdmin)
            return true;
        if (club.OwnerId == userId)
            return true;

        if (club.Members.Any(m => m.UserId == userId))
            return club.Members.Any(m => m.UserId == userId && m.IsLeader);

        return await _dbContext.ClubMembers
            .AnyAsync(m => m.ClubId == club.Id && m.UserId == userId && m.IsLeader, ct);
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Название обязательно");
        if (name.Length > MaxClubNameLength)
            throw new ArgumentException($"Название кружка — не более {MaxClubNameLength} символов");
    }

    private static void ValidateAvatar(string? avatar)
    {
        if (string.IsNullOrEmpty(avatar))
            return;
        if (!avatar.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) || avatar.Length > MaxAvatarDataUrlLength)
            throw new ArgumentException("Некорректное изображение или превышен лимит 2 МБ");
    }
}
