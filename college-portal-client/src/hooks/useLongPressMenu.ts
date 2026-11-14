import { useCallback, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { KebabMenuHandle } from '../components/ui/KebabMenu';

/** Сколько держать палец/кнопку, чтобы открыть контекстное меню. */
const LONG_PRESS_MS = 450;
/** Сдвиг больше этого отменяет долгое нажатие (значит, пользователь скроллит). */
const MOVE_TOLERANCE = 10;
/** Клик после долгого нажатия не должен срабатывать как обычный тап. */
const CLICK_SUPPRESS_MS = 700;

/**
 * Долгое нажатие (и правый клик) открывает KebabMenu в точке касания.
 * Возвращает ref для меню и набор обработчиков, которые нужно повесить на
 * контейнер сообщения.
 */
export function useLongPressMenu() {
  const menuRef = useRef<KebabMenuHandle>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntilRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const openMenuAt = useCallback((x: number, y: number) => {
    suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
    menuRef.current?.openAt(x, y);
    navigator.vibrate?.(8);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    clearTimer();
    startRef.current = { x: e.clientX, y: e.clientY };
    const { clientX, clientY } = e;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      openMenuAt(clientX, clientY);
    }, LONG_PRESS_MS);
  }, [clearTimer, openMenuAt]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > MOVE_TOLERANCE || Math.abs(e.clientY - start.y) > MOVE_TOLERANCE) {
      clearTimer();
    }
  }, [clearTimer]);

  const onPointerUp = clearTimer;
  const onPointerCancel = clearTimer;
  const onPointerLeave = clearTimer;

  const onContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    clearTimer();
    openMenuAt(e.clientX, e.clientY);
  }, [clearTimer, openMenuAt]);

  // Гасим click, который браузер шлёт после долгого нажатия: иначе сообщение
  // «переключалось» бы, например, кружок начинал воспроизведение.
  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (Date.now() >= suppressClickUntilRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    menuRef,
    longPressHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onContextMenu,
      onClickCapture,
    },
  };
}
