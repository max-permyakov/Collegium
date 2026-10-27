export type RecordingKind = 'voice' | 'circle';

export interface RecordingSession {
  kind: RecordingKind;
  stream: MediaStream;
  /** Stops recording and resolves with the recorded blob and duration. */
  stop: () => Promise<{ blob: Blob; durationMs: number }>;
  /** Aborts without producing anything that should be sent. */
  cancel: () => void;
}

interface RecordingInternals {
  recorder: MediaRecorder;
  chunks: Blob[];
  stream: MediaStream;
  kind: RecordingKind;
  startedAt: number;
  stopped: boolean;
  cancelRequested: boolean;
}

const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4'];
const VIDEO_MIME_CANDIDATES = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const MAX_VOICE_MS = 600_000; // same limit as the backend (25 MB / 600 s)
const MAX_CIRCLE_MS = 60_000; // same limit as the backend (100 MB / 60 s)

function pickMime(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime));
}

/** File extension matching the recorded container. */
export function recordingExtension(mimeType?: string): string {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function recordingFileName(kind: RecordingKind, mimeType?: string): string {
  return kind === 'voice' ? `голосовое.${recordingExtension(mimeType)}` : `кружок.${recordingExtension(mimeType)}`;
}

/** Starts a microphone or camera recording. Throws a native error when permissions are denied. */
export async function startRecording(kind: RecordingKind): Promise<RecordingSession> {
  const constraints: MediaStreamConstraints =
    kind === 'voice'
      ? { audio: true }
      : {
          audio: true,
          video: {
            facingMode: 'user',
            width: { ideal: 480 },
            height: { ideal: 480 },
          },
        };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const mimeType =
    kind === 'voice' ? pickMime(AUDIO_MIME_CANDIDATES) : pickMime(VIDEO_MIME_CANDIDATES);

  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const state: RecordingInternals = {
    recorder,
    chunks: [],
    stream,
    kind,
    startedAt: Date.now(),
    stopped: false,
    cancelRequested: false,
  };

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) state.chunks.push(event.data);
  };

  recorder.start();

  const stop = () =>
    new Promise<{ blob: Blob; durationMs: number }>((resolve, reject) => {
      if (state.stopped) {
        reject(new Error('Запись уже остановлена'));
        return;
      }
      state.stopped = true;
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (state.cancelRequested) {
          reject(new Error('Запись отменена'));
          return;
        }
        const blob = new Blob(state.chunks, { type: state.chunks[0]?.type || mimeType || '' });
        resolve({ blob, durationMs: Math.min(Date.now() - state.startedAt, kind === 'circle' ? MAX_CIRCLE_MS : MAX_VOICE_MS) });
      };
      try {
        recorder.stop();
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        reject(error instanceof Error ? error : new Error('Не удалось остановить запись'));
      }
    });

  const cancel = () => {
    if (state.stopped) return;
    state.cancelRequested = true;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      // Recorder already inactive — nothing to stop.
    }
    stream.getTracks().forEach((track) => track.stop());
  };

  return { kind, stream, stop, cancel };
}

/** Recording duration caps shared with the backend limits. */
export const RECORDING_LIMITS: Record<RecordingKind, number> = {
  voice: MAX_VOICE_MS,
  circle: MAX_CIRCLE_MS,
};
