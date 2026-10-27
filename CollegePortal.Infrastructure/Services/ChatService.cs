using System.Net.Mime;
using CollegePortal.Application.DTOs;
using CollegePortal.Application.Services;
using CollegePortal.Domain.Entities;
using CollegePortal.Domain.Enums;
using CollegePortal.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CollegePortal.Infrastructure.Services;

internal static class ChatEntityExtensions
{
    /// <summary>Id of the participant that is not <paramref name="currentUserId"/>, or null for a stranger.</summary>
    public static Guid? Other(this Chat chat, Guid currentUserId) =>
        chat.User1Id == currentUserId ? chat.User2Id :
        chat.User2Id == currentUserId ? chat.User1Id : null;
}

/// <summary>
/// Direct (1:1) user-to-user chats: listing, cursor pagination, attachments on
/// disk, read receipts and message notifications. Storage for binaries is
/// delegated to IChatFileStore; notification fan-out to INotificationService.
/// </summary>
public class ChatService : IChatService
{
    public const int MaxTextLength = 4000;

    /// <summary>Hard cap for file attachments (512 MB).</summary>
    public const long MaxFileBytes = 512L * 1024 * 1024;

    /// <summary>Voice notes are short recordings; a higher cap forbids them as a file transfer channel.</summary>
    public const long MaxVoiceBytes = 25L * 1024 * 1024;

    /// <summary>Video circles are one minute long, but bitrate varies by codec.</summary>
    public const long MaxCircleBytes = 100L * 1024 * 1024;

    public const int MaxVoiceSeconds = 600;
    public const int MaxCircleSeconds = 60;

    private const int DefaultMessagesLimit = 50;
    private const int MaxMessagesLimit = 500;
    private const int MaxSearchResults = 10;

    private static readonly TimeSpan UploadTtl = TimeSpan.FromHours(24);

    private readonly CollegePortalDbContext _dbContext;
    private readonly INotificationService _notifications;
    private readonly IChatFileStore _fileStore;
    private readonly ILogger<ChatService> _logger;

    public ChatService(
        CollegePortalDbContext dbContext,
        INotificationService notifications,
        IChatFileStore fileStore,
        ILogger<ChatService> logger)
    {
        _dbContext = dbContext;
        _notifications = notifications;
        _fileStore = fileStore;
        _logger = logger;
    }

    public async Task<ChatListItemDto[]> GetListAsync(Guid userId, CancellationToken ct = default)
    {
        var chats = await _dbContext.Chats.AsNoTracking()
            .Where(c => c.User1Id == userId || c.User2Id == userId)
            .Select(c => new
            {
                c.Id,
                c.CreatedAt,
                c.LastMessageAt,
                OtherId = c.User1Id == userId ? c.User2Id : c.User1Id
            })
            .ToListAsync(ct);

        return await BuildListItemsAsync(chats.Select(c => (c.Id, c.OtherId, c.LastMessageAt ?? c.CreatedAt)).ToArray(), userId, ct);
    }

    public async Task<ChatSearchResultDto> SearchAsync(Guid userId, string? query, CancellationToken ct = default)
    {
        var q = (query ?? string.Empty).Trim();
        if (q.Length == 0)
            return new ChatSearchResultDto([], []);

        var lowered = q.ToLowerInvariant();

        var list = await GetListAsync(userId, ct);
        var chats = list
            .Where(c => c.OtherUser.DisplayName?.ToLowerInvariant().Contains(lowered) == true)
            .Take(MaxSearchResults)
            .ToArray();

        var users = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Id != userId && u.IsActive && u.DisplayName.ToLower().Contains(lowered))
            .OrderBy(u => u.DisplayName)
            .Take(MaxSearchResults)
            .Select(u => new ChatUserDto(
                u.Id,
                u.DisplayName,
                u.StudentProfile != null ? u.StudentProfile.AvatarDataUrl : null,
                u.StudentProfile != null && u.StudentProfile.StudyGroup != null ? u.StudentProfile.StudyGroup.Name : null))
            .ToListAsync(ct);

        return new ChatSearchResultDto(chats, users.ToArray());
    }

    public async Task<ChatDto?> GetAsync(Guid chatId, Guid userId, CancellationToken ct = default)
    {
        _logger.LogDebug("Loading chat {ChatId}", chatId);

        var chat = await _dbContext.Chats.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == chatId, ct);
        if (chat == null)
            return null;

        var otherId = chat.Other(userId);
        if (otherId == null)
            return null;

        return await BuildChatDtoAsync(chat.Id, otherId.Value, chat.CreatedAt, ct);
    }

    public async Task<ChatDto?> FindOrCreateAsync(Guid userId, Guid otherUserId, CancellationToken ct = default)
    {
        if (userId == otherUserId)
            throw new ArgumentException("Н нельзя создать чат с самим собой");

        var targetExists = await _dbContext.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id == otherUserId && u.IsActive, ct);
        if (!targetExists)
            return null;

        var (user1Id, user2Id) = NormalizePair(userId, otherUserId);

        var existing = await _dbContext.Chats.AsNoTracking()
            .FirstOrDefaultAsync(c => c.User1Id == user1Id && c.User2Id == user2Id, ct);
        if (existing != null)
            return await BuildChatDtoAsync(existing.Id, otherUserId, existing.CreatedAt, ct);

        var chat = new Chat
        {
            Id = Guid.NewGuid(),
            User1Id = user1Id,
            User2Id = user2Id,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Chats.Add(chat);
        try
        {
            await _dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Another request created the same pair concurrently — reload it.
            existing = await _dbContext.Chats.AsNoTracking()
                .FirstOrDefaultAsync(c => c.User1Id == user1Id && c.User2Id == user2Id, ct);
            if (existing == null)
                throw;

            return await BuildChatDtoAsync(existing.Id, otherUserId, existing.CreatedAt, ct);
        }

        return await BuildChatDtoAsync(chat.Id, otherUserId, chat.CreatedAt, ct);
    }

    public async Task<ChatMessageDto[]?> GetMessagesAsync(
        Guid chatId,
        Guid userId,
        int? latest = null,
        long? beforeSeq = null,
        long? afterSeq = null,
        int? limit = null,
        CancellationToken ct = default)
    {
        if (!await IsParticipantAsync(chatId, userId, ct))
            return null;

        var take = Math.Clamp(limit ?? (latest ?? DefaultMessagesLimit), 1, MaxMessagesLimit);

        var query = _dbContext.ChatMessages
            .AsNoTracking()
            .Include(m => m.Sender).ThenInclude(u => u.StudentProfile)
            .Where(m => m.ChatId == chatId);

        // Cross-partition range: messages newer than the client's newest copy.
        if (afterSeq.HasValue)
        {
            var rows = await query
                .Where(m => m.Id > afterSeq.Value)
                .OrderBy(m => m.Id)
                .Take(take)
                .ToListAsync(ct);
            return rows.Select(ToDto).ToArray();
        }

        List<ChatMessage> messages;
        if (beforeSeq.HasValue)
        {
            messages = await query
                .Where(m => m.Id < beforeSeq.Value)
                .OrderByDescending(m => m.Id)
                .Take(take)
                .ToListAsync(ct);
            messages.Reverse();
        }
        else
        {
            messages = await query
                .OrderByDescending(m => m.Id)
                .Take(take)
                .ToListAsync(ct);
            messages.Reverse();
        }

        return messages.Select(ToDto).ToArray();
    }

    public async Task<ChatMessageResult> SendAsync(Guid chatId, Guid userId, SendChatMessageDto dto, CancellationToken ct = default)
    {
        dto ??= new SendChatMessageDto(null, null, null);

        var chat = await _dbContext.Chats
            .FirstOrDefaultAsync(c => c.Id == chatId, ct);
        if (chat == null || chat.Other(userId) == null)
            return new ChatMessageResult(null, "Чат не найден");

        var text = dto.Text is null ? null : TextSanitizer.Clean(dto.Text, MaxTextLength);

        ChatUpload? upload = null;
        if (dto.UploadId.HasValue)
        {
            upload = await _dbContext.ChatUploads
                .FirstOrDefaultAsync(u => u.Id == dto.UploadId.Value && u.ChatId == chatId && u.UploaderId == userId, ct);
            if (upload == null)
                return new ChatMessageResult(null, "Вложение не найдено — загрузите файл заново");
        }
        else if (string.IsNullOrWhiteSpace(text))
        {
            return new ChatMessageResult(null, "Сообщение пустое");
        }

        var senderName = await _dbContext.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.DisplayName)
            .FirstOrDefaultAsync(ct) ?? "Пользователь";

        var isMedia = upload is { Kind: ChatMessageKind.Voice or ChatMessageKind.VideoCircle };
        var message = new ChatMessage
        {
            ChatId = chatId,
            SenderId = userId,
            Kind = upload?.Kind ?? ChatMessageKind.Text,
            // An attachment with a caption keeps the caption; a plain text
            // message keeps the body; a media note without caption has none.
            Text = upload != null ? (string.IsNullOrWhiteSpace(text) ? null : text) : text,
            FileName = upload?.FileName,
            ContentType = upload?.ContentType,
            SizeBytes = upload?.SizeBytes,
            StorageKey = upload?.StorageKey,
            DurationMs = isMedia && dto.DurationMs.HasValue
                ? Math.Clamp(dto.DurationMs.Value, 0, 600_000)
                : null,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.ChatMessages.Add(message);
        if (upload != null)
            _dbContext.ChatUploads.Remove(upload);

        chat.LastMessageAt = message.CreatedAt;
        await _dbContext.SaveChangesAsync(ct);

        // The counterpart gets an in-app notification + Web Push. Delivery
        // failure must not fail the message that is already saved.
        try
        {
            var otherId = chat.Other(userId)!.Value;
            await _notifications.NotifyUsersAsync(
                [otherId],
                new NotificationMessage(
                    NotificationType.ChatMessage,
                    senderName,
                    BuildPreview(message.Kind, message.Text, message.FileName),
                    $"/chats/{chatId}"),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to notify chat partner about message {MessageId} in chat {ChatId}",
                message.Id,
                chatId);
        }

        var sender = await _dbContext.Users
            .AsNoTracking()
            .Include(u => u.StudentProfile)
            .FirstOrDefaultAsync(u => u.Id == userId, ct);

        return new ChatMessageResult(ToDtoWithSender(message, sender?.DisplayName ?? "", sender?.StudentProfile?.AvatarDataUrl));
    }

    public async Task<bool> MarkReadAsync(Guid chatId, Guid userId, CancellationToken ct = default)
    {
        if (!await IsParticipantAsync(chatId, userId, ct))
            return false;

        await _dbContext.ChatMessages
            .Where(m => m.ChatId == chatId && m.SenderId != userId && m.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ReadAt, DateTime.UtcNow), ct);

        return true;
    }

    public async Task<ChatActionResult> DeleteMessageAsync(long messageId, Guid userId, CancellationToken ct = default)
    {
        var message = await _dbContext.ChatMessages
            .FirstOrDefaultAsync(m => m.Id == messageId, ct);

        if (message == null)
            return ChatActionResult.Ok(); // Nothing to delete — treat as success.

        if (message.SenderId != userId)
            return ChatActionResult.Fail("Удалять можно только свои сообщения");

        if (message.DeletedAt != null)
            return ChatActionResult.Ok();

        message.DeletedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(ct);
        return ChatActionResult.Ok();
    }

    public Task<int> UnreadTotalAsync(Guid userId, CancellationToken ct = default) =>
        _dbContext.ChatMessages.AsNoTracking()
            .Where(m =>
                m.SenderId != userId &&
                m.ReadAt == null &&
                m.DeletedAt == null &&
                (m.Chat.User1Id == userId || m.Chat.User2Id == userId))
            .CountAsync(ct);

    public async Task<ChatUploadResult> SaveUploadAsync(
        Guid chatId,
        Guid userId,
        string kind,
        Stream content,
        string? fileName,
        string? contentType,
        CancellationToken ct = default)
    {
        if (!await IsParticipantAsync(chatId, userId, ct))
            return new ChatUploadResult(null, "Чат не найден");

        var chatKindAndLimit = ResolveKind(kind, contentType);
        if (chatKindAndLimit == null)
            return new ChatUploadResult(null, "Неподдерживаемый тип вложения");

        var (chatKind, limit) = chatKindAndLimit.Value;

        var safeName = SanitizeFileName(fileName);
        var type = SanitizeContentType(contentType);

        var uploaded = await _fileStore.SaveAsync(content, ct);
        var path = _fileStore.GetPath(uploaded.StorageKey);

        var size = new FileInfo(path).Length;
        if (size > limit)
        {
            _fileStore.Delete(uploaded.StorageKey);
            return new ChatUploadResult(null, $"Файл превышает лимит {FormatBytes(limit)} ({chatKind switch { ChatMessageKind.Voice => "голосовые", ChatMessageKind.VideoCircle => "кружки", _ => "файлы" }})");
        }

        var upload = new ChatUpload
        {
            Id = Guid.NewGuid(),
            ChatId = chatId,
            UploaderId = userId,
            Kind = chatKind,
            FileName = safeName,
            ContentType = type,
            SizeBytes = size,
            StorageKey = uploaded.StorageKey
        };

        _dbContext.ChatUploads.Add(upload);
        await _dbContext.SaveChangesAsync(ct);

        return new ChatUploadResult(new ChatUploadDtoResult(
            upload.Id,
            upload.Kind,
            upload.FileName,
            upload.ContentType,
            upload.SizeBytes));
    }

    public async Task<ChatFileAccess?> GetFileAsync(long messageId, Guid userId, CancellationToken ct = default)
    {
        var message = await _dbContext.ChatMessages
            .AsNoTracking()
            .Where(m => m.Id == messageId)
            .Select(m => new
            {
                m.ChatId,
                m.Kind,
                m.FileName,
                m.ContentType,
                m.StorageKey,
                m.CreatedAt,
                m.DeletedAt
            })
            .FirstOrDefaultAsync(ct);

        if (message == null ||
            message.DeletedAt != null ||
            string.IsNullOrEmpty(message.StorageKey))
            return null;

        if (!await IsParticipantAsync(message.ChatId, userId, ct))
            return null;

        var contentType = string.IsNullOrWhiteSpace(message.ContentType)
            ? MediaTypeNames.Application.Octet
            : message.ContentType!;
        var fileName = string.IsNullOrWhiteSpace(message.FileName) ? "файл" : message.FileName!;

        // Only browser-safe families render inline; everything is forced to
        // attachment disposition (text/html can never XSS through the viewer).
        var inline = contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
            || contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase)
            || contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase)
            || string.Equals(contentType, "text/plain", StringComparison.OrdinalIgnoreCase)
            || string.Equals(contentType, "application/pdf", StringComparison.OrdinalIgnoreCase);

        return new ChatFileAccess(message.StorageKey, contentType, fileName, message.CreatedAt, inline);
    }

    // ---------------------------------------------------------------- helpers

    private static (Guid First, Guid Second) NormalizePair(Guid a, Guid b) =>
        a.CompareTo(b) <= 0 ? (a, b) : (b, a);

    private async Task<bool> IsParticipantAsync(Guid chatId, Guid userId, CancellationToken ct) =>
        await _dbContext.Chats.AsNoTracking()
            .AnyAsync(c => c.Id == chatId && (c.User1Id == userId || c.User2Id == userId), ct);

    private async Task<ChatDto> BuildChatDtoAsync(Guid chatId, Guid otherId, DateTime createdAt, CancellationToken ct)
    {
        var other =
            await _dbContext.Users
                .AsNoTracking()
                .Where(u => u.Id == otherId)
                .Select(u => new ChatUserDto(
                    u.Id,
                    u.DisplayName,
                    u.StudentProfile != null ? u.StudentProfile.AvatarDataUrl : null,
                    u.StudentProfile != null && u.StudentProfile.StudyGroup != null ? u.StudentProfile.StudyGroup.Name : null))
                .FirstOrDefaultAsync(ct)
            ?? new ChatUserDto(otherId, "Пользователь", null, null);

        return new ChatDto(chatId, other, createdAt);
    }

    private async Task<ChatListItemDto[]> BuildListItemsAsync(
        IReadOnlyCollection<(Guid Id, Guid OtherId, DateTime Activity)> chats,
        Guid userId,
        CancellationToken ct)
    {
        if (chats.Count == 0)
            return [];

        var otherIds = chats.Select(c => c.OtherId).Distinct().ToArray();
        var users = await _dbContext.Users.AsNoTracking()
            .Where(u => otherIds.Contains(u.Id))
            .Select(u => new ChatUserDto(
                u.Id,
                u.DisplayName,
                u.StudentProfile != null ? u.StudentProfile.AvatarDataUrl : null,
                u.StudentProfile != null && u.StudentProfile.StudyGroup != null ? u.StudentProfile.StudyGroup.Name : null))
            .ToDictionaryAsync(u => u.Id, ct);

        var chatIds = chats.Select(c => c.Id).ToArray();

        var lastMessageIds = await _dbContext.ChatMessages.AsNoTracking()
            .Where(m => chatIds.Contains(m.ChatId) && m.DeletedAt == null)
            .GroupBy(m => m.ChatId)
            .Select(g => new { ChatId = g.Key, MaxId = g.Max(m => m.Id) })
            .ToListAsync(ct);

        var lastMessageIdSet = lastMessageIds.Select(x => x.MaxId).ToArray();
        var lastMessages = await _dbContext.ChatMessages.AsNoTracking()
            .Where(m => lastMessageIdSet.Contains(m.Id))
            .Select(m => new
            {
                m.Id,
                m.ChatId,
                m.SenderId,
                m.Kind,
                m.Text,
                m.FileName,
                m.ContentType,
                m.SizeBytes,
                m.DurationMs,
                m.CreatedAt,
                m.ReadAt,
                m.DeletedAt
            })
            .ToDictionaryAsync(m => m.ChatId, ct);

        var unreadCounts = await _dbContext.ChatMessages.AsNoTracking()
            .Where(m =>
                chatIds.Contains(m.ChatId) &&
                m.SenderId != userId &&
                m.ReadAt == null &&
                m.DeletedAt == null)
            .GroupBy(m => m.ChatId)
            .Select(g => new { ChatId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ChatId, x => x.Count, ct);

        var items = new List<ChatListItemDto>(chats.Count);
        foreach (var chat in chats)
        {
            users.TryGetValue(chat.OtherId, out var user);
            lastMessages.TryGetValue(chat.Id, out var last);

            var other = user ?? new ChatUserDto(chat.OtherId, "Пользователь", null, null);

            var lastMessage = last == null ? null : new ChatMessageDto(
                last.Id,
                last.ChatId,
                last.SenderId,
                users.TryGetValue(last.SenderId, out var lastSender) ? lastSender.DisplayName : "Пользователь",
                null,
                last.Kind,
                last.Text,
                last.FileName,
                last.SizeBytes,
                last.ContentType,
                last.DurationMs,
                last.CreatedAt,
                last.ReadAt,
                last.DeletedAt);

            items.Add(new ChatListItemDto(
                chat.Id,
                other,
                chat.Activity,
                lastMessage,
                unreadCounts.TryGetValue(chat.Id, out var count) ? count : 0));
        }

        return items
            .OrderByDescending(i => i.LastMessage?.CreatedAt ?? i.CreatedAt)
            .ToArray();
    }

    /// <summary>Maps an upload kind name plus content type to a validated (kind, byte limit) pair.</summary>
    private static (ChatMessageKind Kind, long Limit)? ResolveKind(string? kind, string? contentType)
    {
        var normalized = (kind ?? "").Trim().ToLowerInvariant();
        var type = (contentType ?? "").Trim();

        if (normalized == "voice")
        {
            if (!type.StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
                return null;
            return (ChatMessageKind.Voice, MaxVoiceBytes);
        }

        if (normalized == "circle")
        {
            if (!type.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
                return null;
            return (ChatMessageKind.VideoCircle, MaxCircleBytes);
        }

        if (normalized == "file")
        {
            if (string.IsNullOrEmpty(type))
                return null;
            return (ChatMessageKind.File, MaxFileBytes);
        }

        return null;
    }

    private static string SanitizeFileName(string? raw)
    {
        var name = raw ?? string.Empty;
        foreach (var banned in new[] { '/', '\\', ':', '*', '?', '"', '<', '>', '|', '\r', '\n', '\t', '\0' })
            name = name.Replace(banned, ' ');

        name = name.Trim().TrimEnd('.');

        if (name.Length == 0)
            name = "файл";
        if (name.Length > 200)
            name = name[..200];

        return name;
    }

    private static string SanitizeContentType(string? raw)
    {
        var type = (raw ?? string.Empty).Trim().ToLowerInvariant();
        if (type.Length == 0)
            return MediaTypeNames.Application.Octet;
        if (type.Length > 120)
            return MediaTypeNames.Application.Octet;
        return type;
    }

    private static string BuildPreview(ChatMessageKind kind, string? text, string? fileName)
    {
        var preview = kind switch
        {
            ChatMessageKind.Voice => "🎤 Голосовое сообщение",
            ChatMessageKind.VideoCircle => "🎥 Видеокружок",
            ChatMessageKind.File => $"📎 {fileName ?? "Файл"}",
            _ => text ?? string.Empty
        };

        return string.IsNullOrWhiteSpace(preview) ? string.Empty : preview.Trim();
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes >= 1024 * 1024 * 1024)
            return $"{bytes / (1024.0 * 1024 * 1024):0.#} ГБ";
        return $"{bytes / (1024.0 * 1024):0.#} МБ";
    }

    private static ChatMessageDto ToDto(ChatMessage m) =>
        ToDtoWithSender(m, m.Sender.DisplayName, m.Sender.StudentProfile?.AvatarDataUrl);

    private static ChatMessageDto ToDtoWithSender(ChatMessage m, string senderName, string? senderAvatar) =>
        new(
            m.Id,
            m.ChatId,
            m.SenderId,
            senderName,
            senderAvatar,
            m.Kind,
            m.Text,
            m.FileName,
            m.SizeBytes,
            m.ContentType,
            m.DurationMs,
            m.CreatedAt,
            m.ReadAt,
            m.DeletedAt);
}
