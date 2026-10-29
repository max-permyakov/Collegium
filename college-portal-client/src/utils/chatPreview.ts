import { formatDuration } from './file';
import { formatMoscowDate, formatMoscowTime } from './datetime';
import type { ChatMessageDto } from '../types/chats';

/**
 * One-line preview of a message for chat-list rows: media kinds get an icon +
 * caption, text is shown as-is, and own messages are prefixed with «Вы: ».
 */
export function messagePreview(
  message: ChatMessageDto | null | undefined,
  selfId: string | undefined,
): string {
  if (!message) return '';

  let body: string;
  switch (message.kind) {
    case 'Voice':
      body = `🎤 Голосовое сообщение${message.durationMs ? ` · ${formatDuration(message.durationMs)}` : ''}`;
      break;
    case 'VideoCircle':
      body = `🎥 Кружок${message.durationMs ? ` · ${formatDuration(message.durationMs)}` : ''}`;
      break;
    case 'File':
      body = `📎 ${message.fileName ?? 'Файл'}`;
      break;
    default:
      body = message.text ?? '';
  }

  const prefix = selfId && message.senderId === selfId ? 'Вы: ' : '';
  return `${prefix}${body}`;
}

/** Short date label for a list row: time for today, DD.MM otherwise. */
export function itemTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (formatMoscowDate(date) === formatMoscowDate(new Date())) {
    return formatMoscowTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return formatMoscowDate(iso, { day: '2-digit', month: '2-digit' });
}
