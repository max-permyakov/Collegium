import { useEffect, useState } from 'react';
import { GENERAL, pickRandom } from './loadPhrases';

interface FunLoaderProps {
  /** Пул фраз; без него — общий. */
  pool?: string[];
  /** Классы контейнера (высота/выравнивание). */
  className?: string;
  /** Подпись для скринридеров. */
  label?: string;
}

/**
 * Загрузка данных API/дневника: спиннер + вращающиеся шуточные статусы
 * («Боремся с РКН», «Несём ваши оценки» — какой пул передадут).
 */
export function FunLoader({ pool = GENERAL, className = 'min-h-[50vh]', label = 'Данные загружаются' }: FunLoaderProps) {
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

  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`} role="status" aria-live="polite" aria-label={label}>
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      <p className="text-sm text-dark-textMuted text-center px-6">
        <span className="text-primary-400 font-mono text-xs mr-1.5 select-none">&gt;_</span>
        {phrase}
        <span className="inline-block w-5 text-left align-middle" aria-hidden="true">
          {'.'.repeat(dots)}
        </span>
      </p>
    </div>
  );
}
