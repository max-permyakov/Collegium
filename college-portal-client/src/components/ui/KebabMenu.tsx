import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export interface KebabMenuHandle {
  /** Открывает меню в точке экрана (используется долгим нажатием и правым кликом). */
  openAt: (x: number, y: number) => void;
}

interface KebabMenuProps {
  items: KebabMenuItem[];
  ariaLabel?: string;
  /** Extra classes for the trigger button (e.g. for bubbles with colored backgrounds). */
  triggerClassName?: string;
  /** К какому краю якоря прижимать меню. По умолчанию — к правому. */
  align?: 'start' | 'end';
}

interface Anchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const VIEWPORT_MARGIN = 8;
const GAP = 6;

/**
 * «⋮»-меню. Рендерится в портал с position: fixed, поэтому не обрезается
 * контейнерами с overflow и всегда остаётся в пределах экрана: по горизонтали
 * прижимается к якорю с выбранной стороны, по вертикали раскрывается вниз, а
 * если места нет — вверх.
 */
export const KebabMenu = forwardRef<KebabMenuHandle, KebabMenuProps>(function KebabMenu(
  { items, ariaLabel = 'Меню', triggerClassName, align = 'end' },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openAt = useCallback((x: number, y: number) => {
    setAnchor({ left: x, right: x, top: y, bottom: y });
    setPosition(null);
    setOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({ openAt }), [openAt]);

  const toggleFromButton = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    setPosition(null);
    setOpen(true);
  };

  // Позиция считается после первого рендера, когда известны реальные размеры меню.
  useLayoutEffect(() => {
    if (!open || !anchor || !menuRef.current) return;
    const menu = menuRef.current;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxHeight = Math.max(0, vh - VIEWPORT_MARGIN * 2);
    const visibleHeight = Math.min(height, maxHeight);

    let left = align === 'end' ? anchor.right - width : anchor.left;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN));

    let top = anchor.bottom + GAP;
    if (top + visibleHeight > vh - VIEWPORT_MARGIN) {
      top = anchor.top - visibleHeight - GAP;
    }
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vh - visibleHeight - VIEWPORT_MARGIN));

    setPosition({ top, left, maxHeight });
  }, [open, anchor, align, items.length]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    // Меню привязано к точке экрана — при прокрутке закрываем, чтобы оно не «отклеилось».
    const onScroll = () => setOpen(false);
    const onResize = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleFromButton(); }}
        className={`btn-ghost p-1 rounded-lg text-dark-textMuted hover:text-dark-text ${triggerClassName ?? ''}`}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5h.01M12 12h.01M12 19h.01" />
        </svg>
      </button>
      {open && anchor && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[170px] overflow-y-auto rounded-xl bg-dark-card border border-dark-border shadow-xl py-1"
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            maxHeight: position?.maxHeight,
            visibility: position ? 'visible' : 'hidden',
          }}
          role="menu"
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(); }}
              className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-dark-text hover:bg-dark-border'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
});
