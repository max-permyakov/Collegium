import { useEffect, useRef } from 'react';

/**
 * Живой фон платформы:
 *  — тонкая точечная сетка, по которой изредка пробегает световой импульс;
 *  — четыре дрейфующих цветных пятна (sky/indigo/violet/emerald) с параллаксом
 *    от курсора: каждое пятно смещается со своей глубиной (--par-deep).
 * Всё на CSS — transform/opacity/mask; blur не используется (перф).
 * Параллакс обновляется rAF-троттлингом, без постоянного цикла.
 */
export function AmbientBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        el.style.setProperty('--par-x', nx.toFixed(3));
        el.style.setProperty('--par-y', ny.toFixed(3));
      });
    };
    const onLeave = () => {
      el.style.setProperty('--par-x', '0');
      el.style.setProperty('--par-y', '0');
    };

    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Точечная сетка + бегущий по ней импульс света */}
      <div className="ambient-grid" />
      <div className="ambient-grid-glow" />

      {/* Пятна-глубина: обёртка ловит параллакс, внутри — свой дрейф */}
      <div className="ambient-blob ambient-blob-1"><i className="ambient-drift ambient-drift-1" /></div>
      <div className="ambient-blob ambient-blob-2"><i className="ambient-drift ambient-drift-2" /></div>
      <div className="ambient-blob ambient-blob-3"><i className="ambient-drift ambient-drift-3" /></div>
      <div className="ambient-blob ambient-blob-4"><i className="ambient-drift ambient-drift-4" /></div>
    </div>
  );
}
