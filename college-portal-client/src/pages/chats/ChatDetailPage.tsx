import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { KebabMenu, type KebabMenuItem } from '../../components/ui/KebabMenu';
import { Lightbox } from '../../components/ui/Lightbox';
import { formatMoscowDateTime } from '../../utils/datetime';
import { formatDuration, formatFileSize } from '../../utils/file';
import { CHAT_TEXT_LIMIT, MAX_MESSAGE_PARTS, splitMessageText } from '../../utils/text';
import {
  RECORDING_LIMITS,
  recordingFileName,
  startRecording,
  type RecordingKind,
  type RecordingSession,
} from './recording';
import type { ChatDto, ChatListItemDto, ChatMessageDto, ChatPresenceDto } from '../../types/chats';

const PAGE_SIZE = 30;
const POLL_MS = 2500;
/** How often the cached window is reconciled (catches messages deleted by others). */
const FULL_SYNC_MS = 45_000;
/** Heartbeat while the conversation is open (server TTL is 25 s). */
const PRESENCE_MS = 10_000;
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_VOICE_BYTES = 25 * 1024 * 1024;
const MAX_CIRCLE_BYTES = 100 * 1024 * 1024;
/** Через сколько удержания кнопки записи начинается запись. */
const RECORD_HOLD_MS = 500;
/** Смещение кнопки записи влево для отмены (в px). */
const RECORD_CANCEL_DX = -60;

const getError = (err: unknown) => {
  const e = err as { response?: { data?: { message?: string } }; code?: string; name?: string };
  return e.response?.data?.message || 'Произошла ошибка';
};

const isCanceled = (err: unknown) =>
  (err as { code?: string })?.code === 'ERR_CANCELED' || (err as { name?: string })?.name === 'CanceledError';

const formatTime = (value: string) =>
  formatMoscowDateTime(value, { hour: '2-digit', minute: '2-digit' });

const formatFullDate = (value: string) =>
  formatMoscowDateTime(value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** «Была в 14:05» для сегодняшнего дня, «была 28.10 14:05» для предыдущих. */
const formatLastSeen = (value: string) => {
  const d = new Date(value);
  const text = new Date().toDateString() === d.toDateString()
    ? `в ${formatMoscowDateTime(value, { hour: '2-digit', minute: '2-digit' })}`
    : formatMoscowDateTime(value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return text;
};

const isImageContent = (message: ChatMessageDto) => (message.contentType ?? '').startsWith('image/');

const mine = (message: ChatMessageDto, userId?: string): boolean => message.senderId === userId;

const TickIcon = ({ read }: { read: boolean }) =>
  read ? (
    <svg viewBox="0 0 24 24" className="w-4 h-3.5 text-sky-300" fill="none" stroke="currentColor" strokeWidth={2.5} aria-label="Прочитано" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 7l-8.5 9L5 12.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7l-8.5 9-1.6-1.7" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-4 h-3.5 text-white/60" fill="none" stroke="currentColor" strokeWidth={2.5} aria-label="Отправлено" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 7l-8.5 9L5 12.5" />
    </svg>
  );

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m14 0v1a7 7 0 01-14 0v-1m7 8v3m0 0h3m-3 0H9M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z" />
  </svg>
);

const VideoIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 10-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20 13" />
  </svg>
);

const SendIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

const StopIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const SavedIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
  </svg>
);

const SupportIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
    <circle cx="12" cy="12" r="3.5" strokeWidth={2} />
    <path strokeLinecap="round" strokeWidth={2} d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4" />
  </svg>
);

const VoiceBubble = memo(function VoiceBubble({
  message,
  mine: own,
}: {
  message: ChatMessageDto;
  mine: boolean;
}) {
  const url = chatsApi.fileUrl(message.id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(message.durationMs ?? null);

  const total = durationMs ?? 0;
  const progress = total > 0 ? Math.min(1, positionMs / total) : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play().catch(() => undefined);
    }
  };

  const seek = (ratio: number) => {
    const el = audioRef.current;
    if (!el || total <= 0) return;
    el.currentTime = Math.max(0, Math.min(1, ratio)) * (total / 1000);
    setPositionMs(el.currentTime * 1000);
  };

  return (
    <div className="flex items-center gap-2 min-w-[13rem] max-w-full">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Воспроизвести голосовое сообщение'}
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
          own ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-primary-500/20 hover:bg-primary-500/30 text-primary-400'
        }`}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
            <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5" fill="currentColor" aria-hidden="true">
            <path d="M8 5l11 7-11 7z" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-[7rem]">
        <div
          role="slider"
          aria-label="Прогресс голосового сообщения"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - rect.left) / rect.width);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') seek(progress + 0.1);
            if (e.key === 'ArrowLeft') seek(progress - 0.1);
          }}
          className={`h-2 rounded-full cursor-pointer ${own ? 'bg-white/25' : 'bg-dark-border'}`}
        >
          <div className={`h-full rounded-full ${own ? 'bg-white' : 'bg-primary-400'}`} style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <span className="text-[11px] whitespace-nowrap opacity-70">{formatDuration(total)}</span>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          const seconds = Number.isFinite(el.duration) ? el.duration : 0;
          if (seconds > 0) setDurationMs(Math.round(seconds * 1000));
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); }}
        onEnded={() => { setPlaying(false); setPositionMs(0); }}
        onTimeUpdate={(e) => setPositionMs(e.currentTarget.currentTime * 1000)}
        onError={() => setPlaying(false)}
      />
    </div>
  );
});

const CircleBubble = memo(function CircleBubble({
  message,
  own,
  showReceipts,
  onDownload,
  onForward,
  onShare,
  onDelete,
}: {
  message: ChatMessageDto;
  own: boolean;
  showReceipts: boolean;
  onDownload: (messageId: number) => void;
  onForward: (message: ChatMessageDto) => void;
  onShare: (message: ChatMessageDto) => void;
  onDelete: (messageId: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  };

  // При воспроизведении кружок увеличивается примерно на треть.
  const idleSize = 'w-40 h-40 sm:w-48 sm:h-48';
  const playingSize = 'w-52 h-52 sm:w-64 sm:h-64';

  return (
    <div className={playing ? 'relative z-10' : 'relative'}>
      <video
        ref={ref}
        src={chatsApi.fileUrl(message.id)}
        preload="metadata"
        playsInline
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className={`${playing ? playingSize : idleSize} rounded-full object-cover cursor-pointer bg-black/50 transition-[width,height] duration-200 ease-out`}
        aria-label="Видеосообщение-кружок"
      />
      {!playing && (
        <div
          className={`absolute inset-0 flex items-center justify-center ${idleSize} rounded-full bg-black/25 text-white pointer-events-none`}
        >
          <svg viewBox="0 0 24 24" className="w-10 h-10 drop-shadow" fill="currentColor" aria-hidden="true">
            <path d="M8 5l11 7-11 7z" />
          </svg>
        </div>
      )}
      {/* Мета-плашка поверх видео: длительность · время · галочки */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] pointer-events-none">
        {message.durationMs ? <span>{formatDuration(message.durationMs)}</span> : null}
        <span>{formatTime(message.createdAt)}</span>
        {own && showReceipts && <TickIcon read={Boolean(message.readAt)} />}
      </div>
      <div className="absolute top-2 right-2">
        <KebabMenu
          ariaLabel="Действия с сообщением"
          triggerClassName="text-white/90 hover:text-white hover:bg-white/20 bg-black/30"
          menuClassName="top-full mt-1"
          items={buildMenuItems(message, own, { onDelete, onForward, onShare, onDownload })}
        />
      </div>
    </div>
  );
});

interface MessageActionHandlers {
  onDelete: (messageId: number) => void;
  onForward: (message: ChatMessageDto) => void;
  onShare: (message: ChatMessageDto) => void;
  onDownload: (messageId: number) => void;
  onStartEdit?: (message: ChatMessageDto) => void;
}

/** Список «⋮»-действий для сообщения: зависит от автора и типа контента. */
const buildMenuItems = (message: ChatMessageDto, own: boolean, h: MessageActionHandlers): KebabMenuItem[] => {
  const download = { label: 'Скачать', onClick: () => h.onDownload(message.id) };
  const forward = { label: 'Переслать', onClick: () => h.onForward(message) };
  const share = { label: 'Поделиться', onClick: () => h.onShare(message) };

  if (!own) {
    const items = [forward, share];
    if (message.kind !== 'Text') items.push(download);
    return items;
  }

  const items: KebabMenuItem[] = [];
  if (message.kind === 'Text') items.push({ label: 'Изменить', onClick: () => h.onStartEdit?.(message) });
  items.push(forward, share);
  if (message.kind !== 'Text') items.push(download);
  items.push({
    label: 'Удалить',
    danger: true,
    onClick: () => { if (confirm('Удалить сообщение?')) h.onDelete(message.id); },
  });
  return items;
};

interface MessageBubbleProps {
  message: ChatMessageDto;
  mine: boolean;
  /** Read receipts only make sense between two different people. */
  showReceipts: boolean;
  onImageClick: (src: string) => void;
  onDelete: (messageId: number) => void;
  onForward: (message: ChatMessageDto) => void;
  onShare: (message: ChatMessageDto) => void;
  onDownload: (messageId: number) => void;
  onStartEdit?: (message: ChatMessageDto) => void;
}

const MessageBubble = memo(function MessageBubble({
  message,
  mine: own,
  showReceipts,
  onImageClick,
  onDelete,
  onForward,
  onShare,
  onDownload,
  onStartEdit,
}: MessageBubbleProps) {
  // Кружки живут вне «облачка»: это просто видео в круге с мета-плашкой.
  if (message.kind === 'VideoCircle') {
    return (
      <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
        <CircleBubble
          message={message}
          own={own}
          showReceipts={showReceipts}
          onDownload={onDownload}
          onForward={onForward}
          onShare={onShare}
          onDelete={onDelete}
        />
      </div>
    );
  }

  const kebabTrigger = own
    ? 'text-white/70 hover:text-white hover:bg-white/15'
    : 'text-dark-textMuted/70 hover:text-dark-text hover:bg-dark-border/60';

  return (
    <div className={`flex items-start ${own ? 'justify-end' : 'justify-start'}`}>
      {!own && (
        <KebabMenu
          ariaLabel="Действия с сообщением"
          triggerClassName={`opacity-30 hover:opacity-100 ${kebabTrigger}`}
          menuClassName="bottom-full mb-1"
          items={buildMenuItems(message, own, { onDelete, onForward, onShare, onDownload })}
        />
      )}
      <div
        title={formatFullDate(message.createdAt)}
        className={`relative max-w-[85%] sm:max-w-md rounded-2xl py-2 space-y-1 ${
          own
            ? 'pl-3 pr-9 bg-primary-500 text-white rounded-br-md'
            : 'px-3 bg-dark-card border border-dark-border text-dark-text rounded-bl-md'
        }`}
      >
        {message.kind === 'Voice' && <VoiceBubble message={message} mine={own} />}
        {message.kind === 'File' && (
          isImageContent(message) ? (
            <img
              src={chatsApi.fileUrl(message.id)}
              alt={message.fileName ?? 'Изображение'}
              className="max-w-xs max-h-64 rounded-xl cursor-zoom-in object-contain"
              onClick={() => onImageClick(chatsApi.fileUrl(message.id))}
            />
          ) : (
            <a
              href={chatsApi.fileUrl(message.id, true)}
              className={`flex items-center gap-2 ${own ? 'text-white' : 'text-primary-400'} hover:underline`}
            >
              <PaperclipIcon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate max-w-[12rem]">{message.fileName ?? 'Файл'}</span>
              <span className="text-[11px] opacity-70 whitespace-nowrap">{formatFileSize(message.sizeBytes)}</span>
            </a>
          )
        )}
        {message.kind !== 'File' && message.text && (
          <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
        )}
        <div className={`flex items-center justify-end gap-1 text-[11px] ${own ? 'text-white/70' : 'text-dark-textMuted'}`}>
          {message.editedAt && <span title={formatFullDate(message.editedAt)}>изменено</span>}
          {own && showReceipts && <TickIcon read={Boolean(message.readAt)} />}
          <span>{formatTime(message.createdAt)}</span>
        </div>
        {own && (
          <div className="absolute top-1 right-1">
            <KebabMenu
              ariaLabel="Действия с сообщением"
              triggerClassName="text-white/70 hover:text-white hover:bg-white/15"
              menuClassName="bottom-full mb-1"
              items={buildMenuItems(message, own, { onDelete, onForward, onShare, onDownload, onStartEdit })}
            />
          </div>
        )}
      </div>
    </div>
  );
});

interface PendingSend {
  key: string;
  label: string;
  percent: number | null;
}

interface UploadPayload {
  blob: Blob;
  kind: 'file' | 'voice' | 'circle';
  fileName: string;
}

interface TaskPayload {
  text?: string;
  upload?: UploadPayload;
  durationMs?: number;
}

export function ChatDetailPage() {
  const { chatId } = useParams<{ chatId: string }>();

  return <ChatConversation chatId={chatId ?? ''} hideBackOnDesktop />;
}

interface ChatConversationProps {
  chatId: string;
  /** Admin inbox mode: the thread belongs to a user and staff reply as support. */
  adminView?: boolean;
  /** Custom back handler (admin inbox keeps the conversation inside the tab). */
  onBack?: () => void;
  /** Hide the back button on desktop, where the chat list is always visible. */
  hideBackOnDesktop?: boolean;
  backLabel?: string;
  className?: string;
}

export function ChatConversation({
  chatId,
  adminView = false,
  onBack,
  hideBackOnDesktop = false,
  backLabel = 'Назад к чатам',
  className,
}: ChatConversationProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else navigate('/chats');
  }, [onBack, navigate]);

  /** Refreshes both the regular chat list and the shared support inbox. */
  const invalidateLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['chats'] });
    queryClient.invalidateQueries({ queryKey: ['admin-support'] });
  }, [queryClient]);

  const [error, setError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [pendingSends, setPendingSends] = useState<PendingSend[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const [recording, setRecording] = useState<{ kind: RecordingKind; session: RecordingSession } | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  /** Выбранный режим записи: клик по кнопке переключает микрофон ↔ камера. */
  const [recordMode, setRecordMode] = useState<RecordingKind>('voice');
  const [cancelArmed, setCancelArmed] = useState(false);
  /** Сообщение, текст которого сейчас редактируется в композере. */
  const [editing, setEditing] = useState<ChatMessageDto | null>(null);
  /** Сообщение, для которого открыты варианты «Переслать». */
  const [forwardSource, setForwardSource] = useState<ChatMessageDto | null>(null);
  /** Короткая зелёная плашка «Переслано / Скопировано». */
  const [flashMessage, setFlashMessage] = useState('');
  /** Показано приглашение drag & drop. */
  const [dragOverFiles, setDragOverFiles] = useState(false);
  const dragDepthRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingClearTimerRef = useRef<number | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const composerTextRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAtBottomRef = useRef(true);
  const pendingPrependRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const queueRef = useRef<(() => Promise<void>)[]>([]);
  const runningRef = useRef(false);
  const keyCounter = useRef(0);
  const abortMap = useRef(new Map<string, AbortController>());
  const recordingStopRef = useRef<(() => void) | null>(null);
  const recordingSessionRef = useRef<RecordingSession | null>(null);
  const reachedStartRef = useRef(false);
  const readRequestedRef = useRef(false);
  const lastFullSyncRef = useRef(0);
  const olderLoadingRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const cancelArmedRef = useRef(false);

  const { data: chat, isLoading: chatLoading, error: chatError } = useQuery<ChatDto>({
    queryKey: ['chat', chatId],
    queryFn: async () => (await chatsApi.get(chatId!)).data,
    enabled: Boolean(chatId),
    retry: false,
    // The header barely changes: keep it cached so reopening a chat is instant.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  /** Статус собеседника (в сети / печатает / записывает) показываем только в прямых чатах. */
  const showPartnerStatus = chat?.kind === 'Direct' && !adminView;
  const { data: partnerPresence } = useQuery<ChatPresenceDto>({
    queryKey: ['chat-presence', chatId],
    queryFn: async () => (await chatsApi.getPresence(chatId!)).data,
    enabled: showPartnerStatus && Boolean(chatId),
    refetchInterval: 4_000,
    retry: false,
  });

  const partnerStatusText = showPartnerStatus && partnerPresence
    ? partnerPresence.activity === 'typing'
      ? 'печатает…'
      : partnerPresence.activity === 'recordingVoice'
        ? 'записывает голос…'
        : partnerPresence.activity === 'recordingCircle'
          ? 'записывает видео…'
          : partnerPresence.isOnline
            ? 'в сети'
            : partnerPresence.lastSeenAt
              ? `был(а) ${formatLastSeen(partnerPresence.lastSeenAt)}`
              : 'не в сети'
    : null;

  const { data: messages } = useQuery<ChatMessageDto[]>({
    queryKey: ['chat-messages', chatId],
    queryFn: async () => {
      const cached = queryClient.getQueryData<ChatMessageDto[]>(['chat-messages', chatId]) ?? [];
      const newestId = cached.length > 0 ? cached[cached.length - 1].id : null;
      const needsFullSync =
        cached.length === 0 || Date.now() - lastFullSyncRef.current > FULL_SYNC_MS;

      // First page and the periodic reconciliation fetch only the newest
      // window; everything in between is an incremental afterSeq request that
      // usually returns just one message (or nothing).
      if (needsFullSync) {
        lastFullSyncRef.current = Date.now();
        const res = await chatsApi.getMessages(chatId!, { latest: PAGE_SIZE });
        const fetched = res.data;

        if (cached.length === 0) {
          setHasOlder(!reachedStartRef.current && fetched.length >= PAGE_SIZE);
          return fetched;
        }

        // Rows inside the window that vanished on the server were deleted for
        // everyone — drop them locally. Older loaded history and messages newer
        // than the window (still in flight) are preserved.
        const fetchedIds = new Set(fetched.map((m) => m.id));
        const minId = fetched.length > 0 ? fetched[0].id : null;
        const maxId = fetched.length > 0 ? fetched[fetched.length - 1].id : null;
        const map = new Map<number, ChatMessageDto>();
        for (const m of cached) {
          const insideWindow = minId !== null && maxId !== null && m.id >= minId && m.id <= maxId;
          if (!insideWindow || fetchedIds.has(m.id)) map.set(m.id, m);
        }
        for (const m of fetched) map.set(m.id, m);
        return [...map.values()].sort((a, b) => a.id - b.id);
      }

      if (newestId === null) return cached;

      const res = await chatsApi.getMessages(chatId!, { afterSeq: newestId, limit: 100 });
      if (res.data.length === 0) return cached; // same reference: no re-render

      const map = new Map<number, ChatMessageDto>(cached.map((m) => [m.id, m]));
      for (const m of res.data) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.id - b.id);
    },
    enabled: Boolean(chatId),
    refetchInterval: POLL_MS,
    staleTime: 2_000,
    // Keep each conversation cached while the user browses other chats.
    gcTime: 30 * 60_000,
  });

  const messageList = messages ?? [];

  // Reset state when switching to another chat.
  useEffect(() => {
    setError('');
    setMessageText('');
    setPendingSends([]);
    setEditing(null);
    setForwardSource(null);
    reachedStartRef.current = false;
    readRequestedRef.current = false;
    lastFullSyncRef.current = 0;
    olderLoadingRef.current = false;
    setHasOlder(true);
    isAtBottomRef.current = true;
    setAtBottom(true);
    queueRef.current = [];
  }, [chatId]);

  // Heartbeat: tell the server this conversation is on screen, so incoming
  // messages do not spawn notifications the user is already reading. Sent only
  // while the tab is visible; stops as soon as the chat closes.
  useEffect(() => {
    if (!chatId) return;

    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      void chatsApi.presence(chatId).catch(() => undefined);
    };

    ping();
    const timer = window.setInterval(ping, PRESENCE_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [chatId]);

  const appendMessage = useCallback((message: ChatMessageDto) => {
    queryClient.setQueryData<ChatMessageDto[]>(['chat-messages', chatId], (old) => {
      if (!old) return [message];
      if (old.some((m) => m.id === message.id)) return old;
      return [...old, message];
    });
  }, [chatId, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: () => chatsApi.markRead(chatId!),
    onSuccess: () => {
      // Локально закрываем непрочитанные входящие сообщения до следующего опроса.
      queryClient.setQueryData<ChatMessageDto[]>(['chat-messages', chatId], (old) =>
        old
          ? old.map((m) =>
              (!mine(m, user?.id) && !m.readAt)
                ? { ...m, readAt: new Date().toISOString() }
                : m,
            )
          : old,
      );
      invalidateLists();
    },
  });

  const unreadIncoming = messageList.some(
    (m) => !mine(m, user?.id) && !m.readAt,
  );

  // Отметка «прочитано», когда открыт чат и есть непрочитанные сообщения.
  useEffect(() => {
    if (!chatId || !unreadIncoming || readRequestedRef.current) return;
    if (document.visibilityState !== 'visible') return;
    readRequestedRef.current = true;
    markReadMutation.mutate(undefined, {
      onSettled: () => { readRequestedRef.current = false; },
    });
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: number) => chatsApi.deleteMessage(messageId),
    onSuccess: (_data, messageId) => {
      queryClient.setQueryData<ChatMessageDto[]>(['chat-messages', chatId], (old) =>
        old ? old.filter((m) => m.id !== messageId) : old,
      );
      invalidateLists();
    },
    onError: (err) => setError(isCanceled(err) ? '' : getError(err)),
  });

  const handleDeleteMessage = useCallback((messageId: number) => deleteMessageMutation.mutate(messageId), [deleteMessageMutation]);
  const handleImageClick = useCallback((src: string) => setPreviewImage(src), []);

  const showFlash = useCallback((text: string) => {
    setFlashMessage(text);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashMessage(''), 2500);
  }, []);

  useEffect(() => () => {
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
  }, []);

  /** «Поделиться» наружу: Web Share API, иначе буфер обмена. */
  const handleShareMessage = useCallback(async (message: ChatMessageDto) => {
    const isText = message.kind === 'Text';
    if (isText && !message.text) return;
    const payload: ShareData = isText
      ? { title: 'KKEP.ka', text: message.text! }
      : { title: 'KKEP.ka', text: message.fileName ?? 'Вложение', url: new URL(chatsApi.fileUrl(message.id, true), window.location.origin).href };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
    } catch (err) {
      // Пользователь закрыл системную панель — это не ошибка.
      if ((err as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(isText ? message.text! : payload.url!);
      showFlash(isText ? 'Текст скопирован' : 'Ссылка скопирована');
    } catch {
      setError('Не удалось поделиться сообщением');
    }
  }, [showFlash]);

  const editMessageMutation = useMutation({
    mutationFn: (payload: { messageId: number; text: string }) => chatsApi.editMessage(payload.messageId, payload.text),
    onSuccess: (data) => {
      const edited = data.data;
      queryClient.setQueryData<ChatMessageDto[]>(['chat-messages', chatId], (old) =>
        old ? old.map((m) => (m.id === edited.id ? edited : m)) : old,
      );
      invalidateLists();
      setEditing(null);
      setMessageText('');
      if (composerTextRef.current) composerTextRef.current.style.height = 'auto';
    },
    onError: (err) => setError(isCanceled(err) ? '' : getError(err)),
  });

  const handleStartEdit = useCallback((message: ChatMessageDto) => {
    if (document.visibilityState !== 'visible') return;
    setEditing(message);
    setMessageText(message.text ?? '');
    composerTextRef.current?.focus();
  }, []);

  const cancelEditing = useCallback(() => {
    setEditing(null);
    setMessageText('');
    if (composerTextRef.current) composerTextRef.current.style.height = 'auto';
  }, []);

  const forwardMutation = useMutation({
    mutationFn: (payload: { messageId: number; targetChatId: string }) =>
      chatsApi.forwardMessage(payload.messageId, payload.targetChatId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', vars.targetChatId] });
      invalidateLists();
      setForwardSource(null);
      showFlash('Сообщение переслано');
    },
    onError: (err) => setError(isCanceled(err) ? '' : getError(err)),
  });

  const handleForwardMessage = useCallback((message: ChatMessageDto) => setForwardSource(message), []);
  const handleDownloadMessage = useCallback((messageId: number) => {
    window.location.assign(chatsApi.fileUrl(messageId, true));
  }, []);

  // Список чатов для выбора адресата пересылки (используем общий кеш списка).
  const { data: forwardChats } = useQuery<ChatListItemDto[]>({
    queryKey: ['chats'],
    queryFn: async () => (await chatsApi.list()).data,
    enabled: Boolean(forwardSource),
    refetchOnMount: false,
  });
  const forwardTargets = (forwardChats ?? [])
    .filter((c) => c.id !== chatId && (c.kind === 'Direct' || c.kind === 'Saved'));

  // ---------- Очередь отправки ----------
  function runQueue() {
    if (runningRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    runningRef.current = true;
    void next().finally(() => {
      runningRef.current = false;
      runQueue();
    });
  }

  const enqueueTask = useCallback((payload: TaskPayload, label: string) => {
    if (!chatId) return;
    const key = `p${++keyCounter.current}`;

    queueRef.current.push(async () => {
      setPendingSends((ps) => [...ps, { key, label, percent: payload.upload ? 0 : null }]);
      const controller = new AbortController();
      abortMap.current.set(key, controller);
      try {
        let uploadId: string | undefined;
        if (payload.upload) {
          const res = await chatsApi.upload(
            chatId,
            payload.upload.blob,
            payload.upload.kind,
            payload.upload.fileName,
            (percent) => setPendingSends((ps) => ps.map((p) => (p.key === key ? { ...p, percent } : p))),
            controller.signal,
          );
          uploadId = res.data.id;
          setPendingSends((ps) => ps.map((p) => (p.key === key ? { ...p, percent: null } : p)));
        }
        const sent = await chatsApi.send(chatId, {
          text: payload.text ?? undefined,
          uploadId,
          durationMs: payload.durationMs,
        });
        appendMessage(sent.data);
        invalidateLists();
        isAtBottomRef.current = true;
        setPendingSends((ps) => ps.filter((p) => p.key !== key));
      } catch (err) {
        setPendingSends((ps) => ps.filter((p) => p.key !== key));
        if (!isCanceled(err)) setError(getError(err));
      } finally {
        abortMap.current.delete(key);
      }
    });

    runQueue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, appendMessage, invalidateLists]);

  useEffect(() => () => {
    abortMap.current.forEach((controller) => controller.abort());
    abortMap.current.clear();
  }, []);

  const cancelPending = (key: string) => {
    abortMap.current.get(key)?.abort();
  };

  const sendText = () => {
    const text = messageText.trim();
    if (!text || !chatId) return;

    // The backend caps one message at 4000 chars; longer input is sent as a
    // series of separate messages, split on readable boundaries.
    const parts = splitMessageText(text, CHAT_TEXT_LIMIT);
    if (parts.length > MAX_MESSAGE_PARTS) {
      setError(`Сообщение слишком длинное. Максимум ${MAX_MESSAGE_PARTS * CHAT_TEXT_LIMIT} символов`);
      return;
    }

    setMessageText('');
    if (composerTextRef.current) composerTextRef.current.style.height = 'auto';
    for (const part of parts) {
      enqueueTask({ text: part }, part.slice(0, 60));
    }
  };

  const sendFile = (file: File) => {
    if (!chatId) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`Файл слишком большой. Максимум ${formatFileSize(MAX_FILE_BYTES)}`);
      return;
    }
    enqueueTask({ upload: { blob: file, kind: 'file', fileName: file.name } }, `📎 ${file.name}`);
  };

  const saveEdit = () => {
    if (!editing) return;
    const text = messageText.trim();
    if (!text) {
      setError('Сообщение не может быть пустым');
      return;
    }
    editMessageMutation.mutate({ messageId: editing.id, text });
  };

  // ---------- Запись голосовых / кружков ----------
  useEffect(() => {
    if (!recording) return;
    const limit = RECORDING_LIMITS[recording.kind];
    setRecordingMs(0);
    const timer = window.setInterval(() => setRecordingMs((ms) => ms + 100), 100);
    const autoStop = window.setTimeout(() => recordingStopRef.current?.(), limit);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(autoStop);
    };
  }, [recording]);

  // Отменяем активную запись при размонтировании — иначе камера/микрофон остаются включенными.
  useEffect(() => () => {
    recordingSessionRef.current?.cancel();
    recordingSessionRef.current = null;
    recordingStopRef.current = null;
  }, []);

  const handleStartRecording = async (kind: RecordingKind) => {
    if (!chatId || recording || isStartingRecording) return;
    setIsStartingRecording(true);
    try {
      const session = await startRecording(kind);
      if (kind === 'voice' && !holdingRef.current) {
        // Кнопку отпустили до появления записи — отменяем молча.
        session.cancel();
        return;
      }
      recordingSessionRef.current = session;
      setRecording({ kind, session });
      recordingStopRef.current = () => {
        // «Stop»: обрабатываем результат и отправляем запись.
        void finishRecording(session, kind);
      };
    } catch (err) {
      holdingRef.current = false;
      setError(
        (err as { name?: string })?.name === 'NotAllowedError'
          ? 'Нет доступа к камере или микрофону'
          : 'Не удалось начать запись',
      );
    } finally {
      setIsStartingRecording(false);
    }
  };

  const finishRecording = async (session: RecordingSession, kind: RecordingKind) => {
    recordingStopRef.current = null;
    recordingSessionRef.current = null;
    setRecording(null);
    setCancelArmed(false);
    cancelArmedRef.current = false;
    try {
      const { blob, durationMs } = await session.stop();
      const sizeLimit = kind === 'voice' ? MAX_VOICE_BYTES : MAX_CIRCLE_BYTES;
      if (blob.size > sizeLimit) {
        setError(`Запись слишком большая. Максимум ${formatFileSize(sizeLimit)}`);
        return;
      }
      if (blob.size === 0) {
        setError('Запись пустая');
        return;
      }
      if (!chatId) return;
      enqueueTask(
        { upload: { blob, kind, fileName: recordingFileName(kind, blob.type) }, durationMs },
        kind === 'voice' ? '🎤 Голосовое сообщение' : '🎥 Кружок',
      );
    } catch {
      // Запись остановлена без результата (отмена или ошибка захвата).
    }
  };

  const handleStopRecording = () => recordingStopRef.current?.();

  const handleCancelRecording = () => {
    recording?.session.cancel();
    recordingSessionRef.current = null;
    recordingStopRef.current = null;
    setRecording(null);
    setCancelArmed(false);
    cancelArmedRef.current = false;
  };

  // ---------- Кнопка записи: клик — выбор режима, удержание — запись ----------
  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleRecordPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (recording || isStartingRecording) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    clearHoldTimer();
    holdingRef.current = false;
    cancelArmedRef.current = false;
    setCancelArmed(false);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      holdingRef.current = true;
      void handleStartRecording(recordMode);
    }, RECORD_HOLD_MS);
  };

  const handleRecordPointerUp = () => {
    clearHoldTimer();
    const wasHolding = holdingRef.current;
    holdingRef.current = false;
    if (!wasHolding) {
      // Короткий тап — переключить режим микрофон ↔ камера.
      if (!recording) setRecordMode((m) => (m === 'voice' ? 'circle' : 'voice'));
      return;
    }
    setCancelArmed(false);
    if (recording?.kind === 'voice') {
      // Голосовое: отпустили — отправляем (или отменяем, если увели влево).
      if (cancelArmedRef.current) handleCancelRecording();
      else handleStopRecording();
    }
    // Кружок: отпускаем без отправки — выбор через кнопки оверлея.
  };

  const handleRecordPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!holdingRef.current || !recording || recording.kind !== 'voice') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const armed = e.clientX - rect.left < RECORD_CANCEL_DX;
    if (armed !== cancelArmedRef.current) {
      cancelArmedRef.current = armed;
      setCancelArmed(armed);
    }
  };

  // Esc — отмена записи.
  const handleCancelRecordingRef = useRef(handleCancelRecording);
  handleCancelRecordingRef.current = handleCancelRecording;
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancelRecordingRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording]);

  // Индикатор «печатает…» для собеседника: слать не чаще 2 с, гасить через 3 с.
  const notifyTyping = useCallback(() => {
    if (!chatId || editing) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current >= 2000) {
      lastTypingSentRef.current = now;
      void chatsApi.setStatus(chatId, 'typing').catch(() => undefined);
    }
    if (typingClearTimerRef.current !== null) window.clearTimeout(typingClearTimerRef.current);
    typingClearTimerRef.current = window.setTimeout(() => {
      lastTypingSentRef.current = 0;
      typingClearTimerRef.current = null;
      void chatsApi.setStatus(chatId, null).catch(() => undefined);
    }, 3000);
  }, [chatId, editing]);

  useEffect(() => () => {
    if (typingClearTimerRef.current !== null) window.clearTimeout(typingClearTimerRef.current);
  }, []);

  // Индикатор «записывает голос / видео» для собеседника пока идёт запись.
  useEffect(() => {
    if (!chatId || !recording) return;
    const activity = recording.kind === 'voice' ? 'recordingVoice' : 'recordingCircle';
    void chatsApi.setStatus(chatId, activity).catch(() => undefined);
    const timer = window.setInterval(() => {
      void chatsApi.setStatus(chatId, activity).catch(() => undefined);
    }, 3000);
    return () => {
      window.clearInterval(timer);
      void chatsApi.setStatus(chatId, null).catch(() => undefined);
    };
  }, [chatId, recording]);

  // ---------- Скролл ----------
  const loadOlder = async () => {
    if (olderLoadingRef.current || !chatId) return;
    const current = queryClient.getQueryData<ChatMessageDto[]>(['chat-messages', chatId]);
    if (!current || current.length === 0) return;
    olderLoadingRef.current = true;
    setOlderLoading(true);
    try {
      const oldest = current[0];
      const res = await chatsApi.getMessages(chatId, { beforeSeq: oldest.id, limit: PAGE_SIZE });
      const ids = new Set(current.map((m) => m.id));
      const added = res.data.filter((m) => !ids.has(m.id));
      if (res.data.length < PAGE_SIZE) {
        reachedStartRef.current = true;
        setHasOlder(false);
      }
      if (added.length === 0) return;
      const el = chatContainerRef.current;
      pendingPrependRef.current = { prevHeight: el?.scrollHeight ?? 0, prevTop: el?.scrollTop ?? 0 };
      queryClient.setQueryData<ChatMessageDto[]>(['chat-messages', chatId], (old) => {
        if (!old) return old;
        const oldIds = new Set(old.map((m) => m.id));
        const toAdd = added.filter((m) => !oldIds.has(m.id));
        return toAdd.length > 0 ? [...toAdd, ...old].sort((a, b) => a.id - b.id) : old;
      });
    } catch (err) {
      setError(getError(err));
    } finally {
      olderLoadingRef.current = false;
      setOlderLoading(false);
    }
  };

  useEffect(() => {
    const el = chatContainerRef.current;
    if (el && isAtBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messageList.length, pendingSends.length]);

  useLayoutEffect(() => {
    const pending = pendingPrependRef.current;
    const el = chatContainerRef.current;
    if (!pending || !el) return;
    pendingPrependRef.current = null;
    el.scrollTop = el.scrollHeight - pending.prevHeight + pending.prevTop;
  }, [messages]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nowAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    isAtBottomRef.current = nowAtBottom;
    setAtBottom(nowAtBottom);

    // Reaching the top loads the previous page automatically.
    if (el.scrollTop < 120 && hasOlder) void loadOlder();
  };

  if (chatLoading) return <div className="skeleton h-64 lg:h-96" />;

  if (chatError || !chat) {
    return (
      <div className="flex flex-col h-full space-y-4 p-3 lg:p-0">
        <Button
          variant="ghost"
          size="sm"
          className={`self-start ${hideBackOnDesktop ? 'lg:hidden' : ''}`}
          onClick={goBack}
        >
          ← {backLabel}
        </Button>
        <div className="p-8 text-center text-dark-textMuted rounded-xl border border-dark-border bg-dark-card">
          Чат не найден или доступ закрыт
        </div>
      </div>
    );
  }

  const isRecordingVoice = recording?.kind === 'voice';
  // Saved is always a service thread; Support is one for its owner, while the
  // admin inbox renders it as a real conversation with the owner.
  const isSpecial = chat.kind === 'Saved' || (chat.kind === 'Support' && !adminView);
  const specialTitle = chat.kind === 'Saved' ? 'Избранное' : chat.kind === 'Support' ? 'Поддержка' : '';
  const specialHint = chat.kind === 'Saved' ? 'Личные заметки и файлы' : 'Опишите проблему — мы поможем';
  const emptyHint =
    chat.kind === 'Saved'
      ? 'Здесь будут ваши заметки и файлы. Сообщения видите только вы.'
      : chat.kind === 'Support'
        ? adminView
          ? 'Пользователь ещё не написал в поддержку.'
          : 'Опишите проблему или задайте вопрос — поддержка ответит здесь.'
        : 'Сообщений пока нет. Напишите первым!';

  return (
    <div
      className={`flex flex-col h-full min-w-0 min-h-0 overflow-hidden p-0 lg:p-3 xl:p-4 relative ${className ?? ''}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setDragOverFiles(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragOverFiles(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setDragOverFiles(false);
        for (const file of Array.from(e.dataTransfer.files)) sendFile(file);
      }}
    >
      {dragOverFiles && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-primary-500/25 backdrop-blur-sm pointer-events-none">
          <div className="px-5 py-3.5 rounded-2xl bg-dark-card border-2 border-dashed border-primary-500 text-primary-400 font-medium shadow-xl">
            Отпустите, чтобы отправить файл
          </div>
        </div>
      )}
      {/* Шапка: имя + фото собеседника (или иконка служебного чата) */}
      <div className="flex items-center gap-3 border-b border-dark-border px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-0 lg:pt-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          aria-label={backLabel}
          className={`p-2 ${hideBackOnDesktop ? 'lg:hidden' : ''}`}
        >
          ←
        </Button>
        {isSpecial ? (
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                chat.kind === 'Saved' ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-400'
              }`}
            >
              {chat.kind === 'Saved' ? <SavedIcon className="w-5 h-5" /> : <SupportIcon className="w-5 h-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-dark-text truncate">{specialTitle}</p>
              <p className="text-xs text-dark-textMuted truncate hidden sm:block">{specialHint}</p>
            </div>
          </div>
        ) : adminView ? (
          <div className="flex items-center gap-3 min-w-0">
            <Avatar src={chat.otherUser.avatarDataUrl || undefined} name={chat.otherUser.displayName} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-dark-text truncate">{chat.otherUser.displayName}</p>
              <p className="text-xs text-dark-textMuted truncate hidden sm:block">
                {chat.otherUser.studyGroupName
                  ? `${chat.otherUser.studyGroupName} · обращение в поддержку`
                  : 'Обращение в поддержку'}
              </p>
            </div>
          </div>
        ) : (
          <Link to={`/users/${chat.otherUser.id}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
            <Avatar src={chat.otherUser.avatarDataUrl || undefined} name={chat.otherUser.displayName} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-dark-text truncate">{chat.otherUser.displayName}</p>
              <p className="text-xs text-dark-textMuted truncate">{partnerStatusText ?? 'Перейти в профиль'}</p>
            </div>
          </Link>
        )}
      </div>

      {error && (
        <div className="mx-3 mt-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between lg:mx-0">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')}>✕</Button>
        </div>
      )}

      {/* Лента сообщений */}
      <div
        ref={chatContainerRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 px-3 pt-3 lg:px-0 lg:pr-1"
      >
        {hasOlder && messageList.length > 0 && (
          <div className="text-center pb-1">
            <Button variant="ghost" size="sm" loading={olderLoading} onClick={() => void loadOlder()}>
              Показать более ранние сообщения
            </Button>
          </div>
        )}
        {messageList.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            mine={mine(m, user?.id)}
            showReceipts={!isSpecial}
            onImageClick={handleImageClick}
            onDelete={handleDeleteMessage}
            onForward={handleForwardMessage}
            onShare={handleShareMessage}
            onDownload={handleDownloadMessage}
            onStartEdit={handleStartEdit}
          />
        ))}
        {pendingSends.map((p) => (
          <div key={p.key} className="flex justify-end">
            <div className="max-w-[85%] sm:max-w-md rounded-2xl px-3 py-2 bg-primary-500 text-white rounded-br-md opacity-80">
              <p className="text-sm truncate">{p.label}</p>
              <div className="flex items-center gap-2">
                {p.percent !== null ? (
                  <div className="h-1.5 w-24 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white" style={{ width: `${p.percent}%` }} />
                  </div>
                ) : (
                  <span className="animate-pulse text-xs opacity-80">Отправка...</span>
                )}
                <button
                  type="button"
                  onClick={() => cancelPending(p.key)}
                  className="text-[11px] underline opacity-70 hover:opacity-100"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ))}
        {messageList.length === 0 && pendingSends.length === 0 && (
          <p className="text-sm text-dark-textMuted text-center py-10 px-4">
            {emptyHint}
          </p>
        )}
        {!atBottom && (
          <button
            type="button"
            onClick={() => {
              isAtBottomRef.current = true;
              const el = chatContainerRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="sticky bottom-2 ml-auto mr-2 w-10 h-10 rounded-full bg-dark-card border border-dark-border shadow-lg flex items-center justify-center text-dark-text hover:bg-dark-border transition-colors"
            aria-label="Вниз"
          >
            ↓
          </button>
        )}
      </div>

      {/* Запись голосового сообщения (строка над полем ввода) */}
      {isRecordingVoice && (
        <div className="mx-3 mt-2 flex items-center gap-3 p-3 rounded-xl border border-primary-500/30 bg-primary-500/10 lg:mx-0">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
          <span className="text-sm text-dark-text font-mono">{formatDuration(recordingMs)}</span>
          <span className={`text-xs truncate flex-1 min-w-0 ${cancelArmed ? 'text-red-400 font-medium' : 'text-dark-textMuted'}`}>
            {cancelArmed
              ? 'Отпустите, чтобы отменить'
              : 'Отпустите, чтобы отправить · уведите влево или Esc — отмена'}
          </span>
        </div>
      )}

      {/* Композер: поле ввода, справа — прикрепить и записать */}
      <div className="mt-3 border-t border-dark-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:px-0 lg:pb-0">
        {editing && (
          <div className="mb-2 flex items-center gap-2 p-2 rounded-xl bg-primary-500/10 border border-primary-500/30 text-sm">
            <svg className="w-4 h-4 text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="flex-1 min-w-0 truncate text-dark-text">
              Изменить сообщение: {editing.text}
            </span>
            <button
              type="button"
              onClick={cancelEditing}
              aria-label="Отменить редактирование"
              className="text-dark-textMuted hover:text-dark-text px-2"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={composerTextRef}
            rows={1}
            value={messageText}
            placeholder={editing ? 'Изменить сообщение...' : 'Написать сообщение...'}
            className="input min-h-[2.5rem] max-h-32 h-10 py-2 resize-none flex-1 min-w-0"
            onChange={(e) => {
              setMessageText(e.target.value);
              notifyTyping();
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (editing) saveEdit();
                else sendText();
              }
            }}
          />
          <label
            className="btn-ghost p-2 rounded-xl flex-shrink-0 cursor-pointer"
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
          >
            <PaperclipIcon className="w-5 h-5" />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) sendFile(file);
              }}
            />
          </label>
          <button
            type="button"
            onPointerDown={handleRecordPointerDown}
            onPointerUp={handleRecordPointerUp}
            onPointerMove={handleRecordPointerMove}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isStartingRecording}
            className={`btn-ghost p-2 rounded-xl flex-shrink-0 touch-none select-none disabled:opacity-40 ${
              isRecordingVoice
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'text-dark-textMuted hover:text-dark-text'
            }`}
            title={isRecordingVoice ? 'Идёт запись' : recordMode === 'voice' ? 'Записать голосовое (удерживать)' : 'Записать видеокружок (удерживать)'}
            aria-label={isRecordingVoice ? 'Остановить запись' : recordMode === 'voice' ? 'Записать голосовое сообщение' : 'Записать видеокружок'}
          >
            {isRecordingVoice ? <StopIcon className="w-5 h-5" /> : recordMode === 'voice' ? <MicIcon className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
          </button>
          <Button
            className="flex-shrink-0 px-3"
            aria-label={editing ? 'Сохранить изменения' : 'Отправить сообщение'}
            title={editing ? 'Сохранить изменения' : 'Отправить'}
            disabled={!messageText.trim() || Boolean(recording)}
            onClick={editing ? saveEdit : sendText}
          >
            {editing ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <SendIcon className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Запись кружка: полноэкранный оверлей */}
      {recording?.kind === 'circle' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-4">
          <video
            ref={(el) => { if (el && el.srcObject !== recording.session.stream) el.srcObject = recording.session.stream; }}
            autoPlay
            muted
            playsInline
            className="w-64 h-64 sm:w-80 sm:h-80 rounded-full object-cover"
          />
          <div className="flex items-center gap-3 text-white">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
            <span className="font-mono text-lg">{formatDuration(recordingMs)}</span>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleCancelRecording}>Отменить</Button>
            <Button onClick={handleStopRecording}>Отправить</Button>
          </div>
        </div>
      )}

      {/* Выбор чата-адресата для пересылки */}
      {forwardSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setForwardSource(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Переслать сообщение"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-dark-card border border-dark-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2 text-sm font-semibold text-dark-text">
              Переслать {forwardSource.kind === 'Text' ? 'сообщение' : 'вложение'}
            </div>
            <div className="max-h-80 overflow-y-auto px-2 pb-2">
              {forwardTargets.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={forwardMutation.isPending}
                  onClick={() => forwardMutation.mutate({ messageId: forwardSource.id, targetChatId: c.id })}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-dark-border text-left disabled:opacity-50"
                >
                  {c.kind === 'Saved' ? (
                    <span className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-amber-500/15 text-amber-400 text-lg">
                      <SavedIcon className="w-4 h-4" />
                    </span>
                  ) : (
                    <Avatar src={c.otherUser.avatarDataUrl || undefined} name={c.otherUser.displayName} size="sm" />
                  )}
                  <span className="min-w-0 text-sm text-dark-text truncate">
                    {c.kind === 'Saved' ? 'Избранное' : c.otherUser.displayName}
                  </span>
                </button>
              ))}
              {forwardChats && forwardTargets.length === 0 && (
                <p className="px-3 py-4 text-sm text-dark-textMuted text-center">
                  Нет других чатов для пересылки
                </p>
              )}
            </div>
            <div className="px-3 py-2 border-t border-dark-border flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setForwardSource(null)}>Отмена</Button>
            </div>
          </div>
        </div>
      )}

      {flashMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm shadow-lg pointer-events-none">
          {flashMessage}
        </div>
      )}

      <Lightbox src={previewImage} alt="Изображение" onClose={() => setPreviewImage(null)} />
    </div>
  );
}
