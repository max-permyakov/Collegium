using Microsoft.Extensions.Caching.Memory;

namespace CollegePortal.Infrastructure.Services;

/// <summary>
/// Remembers which chat a user currently has open (for notification
/// suppression) plus the coarse «в сети / печатает / записывает» status shown
/// in the conversation header. Entries expire on their own: the client
/// refreshes them with heartbeats while the conversation is open and the tab
/// is visible.
/// </summary>
public interface IChatPresenceTracker
{
    /// <summary>Marks the chat as currently open for the user (short TTL).</summary>
    void Touch(Guid userId, Guid chatId);

    /// <summary>True while the user is actively viewing that chat.</summary>
    bool IsViewing(Guid userId, Guid chatId);

    /// <summary>Records the last time the user was seen in the app (used for «был(а) недавно»).</summary>
    void TouchLastSeen(Guid userId);

    /// <summary>
    /// Current lightweight activity ('typing' | 'recordingVoice' |
    /// 'recordingCircle'); null clears it. Short TTL — the client refreshes
    /// it continuously while the activity lasts.
    /// </summary>
    void SetActivity(Guid userId, Guid chatId, string? activity);

    string? GetActivity(Guid userId, Guid chatId);

    /// <summary>Time of the user's last heartbeat; null when cold.</summary>
    DateTime? GetLastSeen(Guid userId);
}

/// <summary>
/// In-memory implementation. A missed heartbeat only means the notification is
/// delivered as usual (and «в сети» falls back to «был(а) недавно»), so with
/// several API replicas the check is best-effort.
/// </summary>
public class ChatPresenceTracker : IChatPresenceTracker
{
    /// <summary>Heartbeats are sent every 10 s; the entry outlives one missed beat.</summary>
    private static readonly TimeSpan ViewingTtl = TimeSpan.FromSeconds(25);

    /// <summary>Typing/recording indicators refresh every ~3 s while the activity lasts.</summary>
    private static readonly TimeSpan ActivityTtl = TimeSpan.FromSeconds(7);

    /// <summary>«Был(а) недавно» stays resolvable for a while after the last heartbeat.</summary>
    private static readonly TimeSpan LastSeenTtl = TimeSpan.FromMinutes(30);

    /// <summary>Online = a heartbeat arrived within this window.</summary>
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromSeconds(35);

    private readonly IMemoryCache _cache;

    public ChatPresenceTracker(IMemoryCache cache)
    {
        _cache = cache;
    }

    private static string ViewingKey(Guid userId, Guid chatId) => $"chat-view:{userId:N}:{chatId:N}";

    private static string ActivityKey(Guid userId, Guid chatId) => $"chat-activity:{userId:N}:{chatId:N}";

    private static string LastSeenKey(Guid userId) => $"chat-seen:{userId:N}";

    public void Touch(Guid userId, Guid chatId)
    {
        TouchLastSeen(userId);
        _cache.Set(ViewingKey(userId, chatId), true, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = ViewingTtl
        });
    }

    public bool IsViewing(Guid userId, Guid chatId) =>
        _cache.TryGetValue(ViewingKey(userId, chatId), out _);

    public void TouchLastSeen(Guid userId) =>
        _cache.Set(LastSeenKey(userId), DateTime.UtcNow, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = LastSeenTtl
        });

    public void SetActivity(Guid userId, Guid chatId, string? activity)
    {
        if (string.IsNullOrWhiteSpace(activity))
        {
            _cache.Remove(ActivityKey(userId, chatId));
            return;
        }

        _cache.Set(ActivityKey(userId, chatId), activity!, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = ActivityTtl
        });
    }

    public string? GetActivity(Guid userId, Guid chatId) =>
        _cache.TryGetValue(ActivityKey(userId, chatId), out string? activity) ? activity : null;

    public DateTime? GetLastSeen(Guid userId) =>
        _cache.TryGetValue(LastSeenKey(userId), out DateTime? lastSeen) ? lastSeen : null;
}
