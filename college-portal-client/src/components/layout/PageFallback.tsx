import { useEffect, useState } from 'react';
import { poolFor, pickRandom } from '../../components/ambient/loadPhrases';

/**
 * Suspense fallback для ленивых роутов: спиннер + вращающиеся статусы,
 * зависящие от текущего адреса. Страницы ждут данные с FunLoader'ом.
 */
export function PageFallback() {
  const [phrase, setPhrase] = useState<string>(() => pickRandom(poolFor(window.location.pathname), null));

  useEffect(() => {
    const timer = window.setInterval(() => setPhrase((p) => pickRandom(poolFor(window.location.pathname), p)), 1200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      <p className="text-sm text-dark-textMuted text-center px-6">
        <span className="text-primary-400 font-mono text-xs mr-1.5 select-none">&gt;_</span>
        {phrase}
        <span className="inline-flex gap-0.5 ml-1 align-middle" aria-hidden="true">
          <span className="w-1 h-1 rounded-full bg-primary-400 animate-bounce" />
          <span className="w-1 h-1 rounded-full bg-primary-400 animate-bounce [animation-delay:120ms]" />
          <span className="w-1 h-1 rounded-full bg-primary-400 animate-bounce [animation-delay:240ms]" />
        </span>
      </p>
    </div>
  );
}
