export type ChatMessageKind = 'Text' | 'File' | 'Voice' | 'VideoCircle';

/** Upload request type used by POST /api/chats/{id}/upload. */
export type ChatUploadKind = 'file' | 'voice' | 'circle';

export interface ChatUserDto {
  id: string;
  displayName: string;
  avatarDataUrl?: string | null;
  studyGroupName?: string | null;
}

export interface ChatMessageDto {
  id: number;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  kind: ChatMessageKind;
  text?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
  contentType?: string | null;
  durationMs?: number | null;
  createdAt: string;
  readAt?: string | null;
  deletedAt?: string | null;
}

export interface ChatDto {
  id: string;
  otherUser: ChatUserDto;
  createdAt: string;
}

export interface ChatListItemDto extends ChatDto {
  lastMessage?: ChatMessageDto | null;
  unreadCount: number;
}

export interface ChatUploadDto {
  id: string;
  kind: ChatMessageKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ChatSearchResultDto {
  chats: ChatListItemDto[];
  users: ChatUserDto[];
}
