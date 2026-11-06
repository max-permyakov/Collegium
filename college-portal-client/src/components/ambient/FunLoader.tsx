import { useEffect, useState } from 'react';
import { GENERAL, pickRandom } from './loadPhrases';

interface FunLoaderProps {
  /** Пул фраз; без него — общий. */
  pool?: string[];
  /** Классы контейнера (высота/выравнивание). */
  className?: string;
  /** Подпись для скринридеров. */
  label?: string;
  /** Компактный режим: маленький спиннер для списков внутри страницы. */
  compact?: boolean;
}

/**
 * Загрузка данных API/дневника: спиннер + вращающиеся шуточные статусы
 * («Боремся с РКН», «Несём ваши оценки» — какой пул передадут).
 */
export function FunLoader({ pool = GENERAL, className, label = 'Данные загружаются', compact = false }: FunLoaderProps) {
  const [phrase, setPhrase] = useState<string>(() => pickRandom(pool, null));
  const [dots, setDots] = useState(1);

  // Фразы крутим интервалом; точкам — через CSS-анимацию, тут только счётчик.
  useEffect(() => {
    const phraseTimer = window.setInterval(() => setPhrase((p) => pickRandom(pool, p)), 1200);
    const dotsTimer = window.setInterval(() => setDots((d) => (d % 3) + 1), 400);
    return () => {
      window.clearInterval(phraseTimer);
      window.clearInterval(dotsTimer);
    };
  }, [pool]);

  const box = className ?? (compact ? 'py-8' : 'min-h-[50vh]');
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${box}`} role="status" aria-live="polite" aria-label={label}>
      <div
        className={
          compact
            ? 'animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent'
            : 'animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent'
        }
      />
      <p className={compact ? 'text-xs text-dark-textMuted text-center px-4' : 'text-sm text-dark-textMuted text-center px-6'}>
        <span className="text-primary-400 font-mono text-xs mr-1.5 select-none">&gt;_</span>
        {phrase}
        <span className="inline-block w-5 text-left align-middle" aria-hidden="true">
          {'.'.repeat(dots)}
        </span>
      </p>
    </div>
  );
}
