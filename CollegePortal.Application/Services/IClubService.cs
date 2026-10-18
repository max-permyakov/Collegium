using CollegePortal.Application.DTOs;

namespace CollegePortal.Application.Services;

public interface IClubService
{
    Task<ClubListDto[]> GetVisibleAsync(Guid userId, bool isAdmin, CancellationToken ct = default);

    Task<ClubDetailDto?> GetAsync(Guid clubId, Guid userId, bool isAdmin, string? inviteToken, CancellationToken ct = default);

    Task<ClubDetailDto> CreateAsync(Guid userId, CreateClubDto dto, CancellationToken ct = default);

    Task<ClubActionResult> UpdateAsync(Guid clubId, Guid userId, bool isAdmin, UpdateClubDto dto, CancellationToken ct = default);

    Task<ClubActionResult> DeleteAsync(Guid clubId, Guid userId, bool isAdmin, CancellationToken ct = default);

    Task<ClubActionResult> JoinAsync(Guid clubId, Guid userId, string? inviteToken, CancellationToken ct = default);

    Task<ClubActionResult> LeaveAsync(Guid clubId, Guid userId, CancellationToken ct = default);

    Task<ClubActionResult> SetLeaderAsync(Guid clubId, Guid actorId, Guid targetUserId, bool isLeader, bool isAdmin, CancellationToken ct = default);

    Task<ClubActionResult> RemoveMemberAsync(Guid clubId, Guid actorId, Guid targetUserId, bool isAdmin, CancellationToken ct = default);

    Task<ClubMessageDto[]?> GetMessagesAsync(Guid clubId, Guid userId, bool isAdmin, string? after = null, string? before = null, int? latest = null, int? limit = null, CancellationToken ct = default);

    Task<ClubMessageDto?> PostMessageAsync(Guid clubId, Guid userId, string text, CancellationToken ct = default);

    Task<ClubActionResult> DeleteMessageAsync(Guid messageId, Guid userId, bool isAdmin, CancellationToken ct = default);

    // Admin control / censorship
    Task<ClubListDto[]> GetAllForAdminAsync(CancellationToken ct = default);

    Task<ClubDetailDto?> GetForAdminAsync(Guid clubId, CancellationToken ct = default);
}
