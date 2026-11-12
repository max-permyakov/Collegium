namespace CollegePortal.Application.Services;

/// <summary>
/// Avatar bytes decoded from the stored data URL. Avatars are served as their
/// own cacheable response so list endpoints can report only "has avatar" and
/// never inline megabytes of base64 into polled JSON.
/// </summary>
public sealed record AvatarImage(byte[] Bytes, string ContentType, DateTimeOffset? LastModified);

public interface IAvatarService
{
    Task<AvatarImage?> GetUserAvatarAsync(Guid userId, CancellationToken ct = default);

    Task<AvatarImage?> GetClubAvatarAsync(Guid clubId, Guid userId, bool isAdmin, CancellationToken ct = default);
}
