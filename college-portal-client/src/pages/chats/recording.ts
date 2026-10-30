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
  /** Треки, которые нужно остановить (для кружка это камера + canvas). */
  tracks: MediaStreamTrack[];
  kind: RecordingKind;
  startedAt: number;
  stopped: boolean;
  cancelRequested: boolean;
  /** Согласие кадров canvas; для голосового не используется. */
  stopDrawing?: () => void;
}

const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4'];
// Сначала MP4: кружок в webm часто не проигрывается (особенно на iOS), mp4 понимают все.
const VIDEO_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];
const MAX_VOICE_MS = 600_000; // same limit as the backend (25 MB / 600 s)
const MAX_CIRCLE_MS = 60_000; // same limit as the backend (100 MB / 60 s)

/** Размер квадрата исходящего кружка (и физический размер canvas). */
const CIRCLE_SIZE = 480;

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

/**
 * Кружковый конвейер: кадры камеры рисуются на квадратный canvas зеркально
 * (selfie-вид как в зеркале) и записываются через canvas.captureStream(30) вместе
 * с исходной аудиодорожкой. Итоговое видео совпадает с тем, что видит автор в
 * оверлее предпросмотра (там используется тот же поток).
 */
type CirclePipeline = MediaStream & { stopDrawing: () => void; cameraTrack: MediaStreamTrack };

async function createCircleStream(camera: MediaStream): Promise<CirclePipeline | MediaStream> {
  const videoTrack = camera.getVideoTracks()[0];
  if (!videoTrack) return camera;

  const video = document.createElement('video');
  video.muted = true;
  video.setAttribute('playsinline', '');
  video.srcObject = new MediaStream([videoTrack]);
  try {
    await video.play();
  } catch {
    // Автовоспроизведение muted-видео всегда разрешено; при отказе пишем первый кадр.
  }

  const canvas = document.createElement('canvas');
  canvas.width = CIRCLE_SIZE;
  canvas.height = CIRCLE_SIZE;
  const ctx = canvas.getContext('2d');

  let rafId = 0;
  const draw = () => {
    if (ctx && video.readyState >= 2 && video.videoWidth > 0) {
      // Центральный квадратный кроп + зеркальное отражение по горизонтали.
      const side = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth - side) / 2;
      const sy = (video.videoHeight - side) / 2;
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, side, side, -CIRCLE_SIZE, 0, CIRCLE_SIZE, CIRCLE_SIZE);
      ctx.restore();
    }
    rafId = requestAnimationFrame(draw);
  };
  draw();

  const canvasStream = canvas.captureStream(30);
  const composed = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...camera.getAudioTracks(),
  ]) as CirclePipeline;

  composed.stopDrawing = () => cancelAnimationFrame(rafId);
  composed.cameraTrack = videoTrack;

  return composed;
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

  const camera = await navigator.mediaDevices.getUserMedia(constraints);
  // Для кружка пишем зеркальный поток с canvas — превью и итог совпадают 1:1.
  const circlePipeline = kind === 'circle' ? await createCircleStream(camera) : null;
  const recordStream = circlePipeline ?? camera;

  const mimeType =
    kind === 'voice' ? pickMime(AUDIO_MIME_CANDIDATES) : pickMime(VIDEO_MIME_CANDIDATES);

  const recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
  const tracks: MediaStreamTrack[] =
    circlePipeline != null
      ? [...recordStream.getTracks(), ...camera.getVideoTracks()]
      : [...camera.getTracks()];

  const state: RecordingInternals = {
    recorder,
    chunks: [],
    tracks,
    kind,
    startedAt: Date.now(),
    stopped: false,
    cancelRequested: false,
    stopDrawing: (circlePipeline as CirclePipeline | null)?.stopDrawing,
  };

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) state.chunks.push(event.data);
  };

  recorder.start();

  const finalize = () => {
    state.stopDrawing?.();
    for (const track of tracks) {
      try {
        track.stop();
      } catch {
        // Track already stopped — nothing else to do.
      }
    }
  };

  const stop = () =>
    new Promise<{ blob: Blob; durationMs: number }>((resolve, reject) => {
      if (state.stopped) {
        reject(new Error('Запись уже остановлена'));
        return;
      }
      state.stopped = true;
      recorder.onstop = () => {
        finalize();
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
        finalize();
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
    finalize();
  };

  return { kind, stream: recordStream, stop, cancel };
}

/** Recording duration caps shared with the backend limits. */
export const RECORDING_LIMITS: Record<RecordingKind, number> = {
  voice: MAX_VOICE_MS,
  circle: MAX_CIRCLE_MS,
};
