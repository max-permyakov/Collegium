import { useEffect } from 'react';

interface LightboxProps {
  src?: string | null;
  alt?: string;
  onClose: () => void;
}

export function Lightbox({ src, alt, onClose }: LightboxProps) {
  useEffect(() => {
    if (!src) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр изображения"
    >
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-dark-card border border-dark-border text-dark-textMuted hover:text-dark-text hover:bg-dark-border transition-colors flex items-center justify-center text-lg"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Закрыть"
      >
        ✕
      </button>
      <button
        className="absolute top-4 left-4 px-4 py-2 rounded-full bg-dark-card border border-dark-border text-dark-textMuted hover:text-dark-text transition-colors text-sm"
        onClick={(e) => { e.stopPropagation(); window.open(src, '_blank', 'noopener'); }}
      >
        Открыть в новой вкладке
      </button>
      <div onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt || 'Изображение'} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
      </div>
    </div>
  );
}