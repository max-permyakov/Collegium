using CollegePortal.Domain.Enums;

namespace CollegePortal.Application.DTOs;

/// <summary>Minimal user card used across the chat UI.</summary>
public record ChatUserDto(
    Guid Id,
    string DisplayName,
    string? AvatarDataUrl,
    string? StudyGroupName);

public record ChatDto(
    Guid Id,
    ChatKind Kind,
    ChatUserDto OtherUser,
    DateTime CreatedAt);

public record ChatMessageDto(
    long Id,
    Guid ChatId,
    Guid SenderId,
    string SenderName,
    string? SenderAvatar,
    ChatMessageKind Kind,
    string? Text,
    string? FileName,
    long? SizeBytes,
    string? ContentType,
    int? DurationMs,
    DateTime CreatedAt,
    DateTime? ReadAt,
    DateTime? DeletedAt,
    DateTime? EditedAt = null);

public record ChatListItemDto(
    Guid Id,
    ChatKind Kind,
    ChatUserDto OtherUser,
    DateTime CreatedAt,
    ChatMessageDto? LastMessage,
    int UnreadCount);

/// <summary>Body of POST /api/chats/{id}/messages. The message kind comes
/// from the referenced upload when present, otherwise it is Text.</summary>
public record SendChatMessageDto(
    string? Text,
    Guid? UploadId,
    int? DurationMs);

public record ChatUploadDtoResult(
    Guid Id,
    ChatMessageKind Kind,
    string FileName,
    string ContentType,
    long SizeBytes);

public record ChatSearchResultDto(
    ChatListItemDto[] Chats,
    ChatUserDto[] Users);

/// <summary>Generic operation result with an optional user-facing error text.</summary>
public record ChatActionResult(bool Success, string? Error = null)
{
    public static ChatActionResult Ok() => new(true);
    public static ChatActionResult Fail(string error) => new(false, error);
}

public record ChatMessageResult(ChatMessageDto? Message, string? Error = null);

public record ChatUploadResult(ChatUploadDtoResult? Upload, string? Error = null);

/// <summary>Access envelope for streaming a stored chat attachment.</summary>
public record ChatFileAccess(
    string StorageKey,
    string ContentType,
    string FileName,
    DateTime CreatedAt,
    bool Inline);

public record UpdateChatMessageDto(string Text);

public record ForwardChatMessageDto(Guid TargetChatId);

/// <summary>Body of POST /api/chats/{id}/status; null clears the activity.</summary>
public record SetChatActivityDto(string? Activity);

/// <summary>Header status of the conversation partner: online, typing/recording or last seen.</summary>
public record ChatPresenceDto(
    bool IsOnline,
    string? Activity,
    DateTime? LastSeenAt);
