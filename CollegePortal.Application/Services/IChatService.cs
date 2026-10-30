using CollegePortal.Application.DTOs;
using CollegePortal.Domain.Enums;

namespace CollegePortal.Application.Services;

public interface IChatService
{
    /// <summary>Chats of the user sorted by latest activity, with previews and unread counters.</summary>
    Task<ChatListItemDto[]> GetListAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Existing chats and users whose display name matches the query, capped lists.</summary>
    Task<ChatSearchResultDto> SearchAsync(Guid userId, string? query, CancellationToken ct = default);

    /// <summary>Chat header payload; null when the chat does not exist or is foreign.</summary>
    Task<ChatDto?> GetAsync(Guid chatId, Guid userId, bool isAdmin = false, CancellationToken ct = default);

    /// <summary>Returns the existing chat between the pair or creates it (race-safe).</summary>
    Task<ChatDto?> FindOrCreateAsync(Guid userId, Guid otherUserId, CancellationToken ct = default);

    /// <summary>
    /// Returns the caller's «Избранное» (Saved) or «Поддержка» (Support) thread,
    /// creating it on first access. Both are self-paired and never notify anyone.
    /// </summary>
    Task<ChatDto> GetOrCreateSpecialAsync(Guid userId, ChatKind kind, CancellationToken ct = default);

    /// <summary>
    /// Messages ordered ascending, cursor-based: afterSeq for polling new ones,
    /// beforeSeq (+ upcoming newer ones excluded) or latest for the first page.
    /// Null means the chat is missing or foreign.
    /// </summary>
    Task<ChatMessageDto[]?> GetMessagesAsync(
        Guid chatId,
        Guid userId,
        int? latest = null,
        long? beforeSeq = null,
        long? afterSeq = null,
        int? limit = null,
        bool isAdmin = false,
        CancellationToken ct = default);

    /// <summary>Persists the message (optionally referencing an upload) and notifies the partner.</summary>
    Task<ChatMessageResult> SendAsync(Guid chatId, Guid userId, SendChatMessageDto dto, bool isAdmin = false, CancellationToken ct = default);

    /// <summary>Marks every message of the partner in this chat as read; returns false if foreign.</summary>
    Task<bool> MarkReadAsync(Guid chatId, Guid userId, bool isAdmin = false, CancellationToken ct = default);

    /// <summary>
    /// Heartbeat for an open conversation: while it is fresh, messages in this
    /// chat do not create notifications for this user. False when access is denied.
    /// </summary>
    Task<bool> TouchPresenceAsync(Guid chatId, Guid userId, bool isAdmin = false, CancellationToken ct = default);

    /// <summary>Deletes the caller's own message for both sides (file included); idempotent.</summary>
    Task<ChatActionResult> DeleteMessageAsync(long messageId, Guid userId, CancellationToken ct = default);

    /// <summary>Edits the text of the sender's own plain-text message; stamps EditedAt.</summary>
    Task<ChatMessageResult> EditMessageAsync(long messageId, Guid userId, UpdateChatMessageDto dto, CancellationToken ct = default);

    /// <summary>Copies a message (text and attachment blob included) into another chat of the user.</summary>
    Task<ChatMessageResult> ForwardMessageAsync(long messageId, Guid userId, Guid targetChatId, bool isAdmin = false, CancellationToken ct = default);

    /// <summary>Typing / recording indicator for the chat; null clears it. False when foreign.</summary>
    Task<bool> SetActivityAsync(Guid chatId, Guid userId, string? activity, CancellationToken ct = default);

    /// <summary>Pins or unpins the chat at the top of caller's list; false when foreign.</summary>
    Task<bool> SetPinnedAsync(Guid chatId, Guid userId, bool pinned, CancellationToken ct = default);

    /// <summary>
    /// Removes the caller's Direct chat from their list (hides it; a new message
    /// from the partner makes it visible again). Service chats cannot be deleted.
    /// </summary>
    Task<ChatActionResult> DeleteChatAsync(Guid chatId, Guid userId, CancellationToken ct = default);

    /// <summary>Header status of the direct conversation partner; null when foreign.</summary>
    Task<ChatPresenceDto?> GetPresenceAsync(Guid chatId, Guid userId, CancellationToken ct = default);

    /// <summary>Total number of unread messages across all the user's chats.</summary>
    Task<int> UnreadTotalAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Streams a raw body into the chat file store and registers a pending upload
    /// that SendAsync later turns into an attachment message.
    /// </summary>
    Task<ChatUploadResult> SaveUploadAsync(
        Guid chatId,
        Guid userId,
        string kind,
        Stream content,
        string? fileName,
        string? contentType,
        bool isAdmin = false,
        CancellationToken ct = default);

    /// <summary>Access-checked attachment descriptor; null when missing/foreign/deleted.</summary>
    Task<ChatFileAccess?> GetFileAsync(long messageId, Guid userId, bool isAdmin = false, CancellationToken ct = default);

    /// <summary>Admin inbox: every Support thread with its owner, last message and unread counter.</summary>
    Task<ChatListItemDto[]> GetSupportInboxAsync(CancellationToken ct = default);
}
