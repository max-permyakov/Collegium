using Microsoft.Extensions.Caching.Memory;

namespace CollegePortal.Infrastructure.Services;

/// <summary>
/// Remembers which chat a user currently has open so that a message in that
/// chat does not produce a notification the user is already reading.
/// Entries expire on their own: the client refreshes them with a heartbeat
/// while the conversation is open and the tab is visible.
/// </summary>
public interface IChatPresenceTracker
{
    /// <summary>Marks the chat as currently open for the user (short TTL).</summary>
    void Touch(Guid userId, Guid chatId);

    /// <summary>True while the user is actively viewing that chat.</summary>
    bool IsViewing(Guid userId, Guid chatId);
}

/// <summary>
/// In-memory implementation. A missed heartbeat only means the notification is
/// delivered as usual, so with several API replicas the check is best-effort.
/// </summary>
public class ChatPresenceTracker : IChatPresenceTracker
{
    /// <summary>Heartbeats are sent every 10 s; the entry outlives one missed beat.</summary>
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(25);

    private readonly IMemoryCache _cache;

    public ChatPresenceTracker(IMemoryCache cache)
    {
        _cache = cache;
    }

    private static string Key(Guid userId, Guid chatId) => $"chat-view:{userId:N}:{chatId:N}";

    public void Touch(Guid userId, Guid chatId) =>
        _cache.Set(Key(userId, chatId), true, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = Ttl
        });

    public bool IsViewing(Guid userId, Guid chatId) =>
        _cache.TryGetValue(Key(userId, chatId), out _);
}
