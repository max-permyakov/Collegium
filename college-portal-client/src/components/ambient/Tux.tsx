import { useRef, useState } from 'react';

const CLICKS_KEY = 'tux:clicks';
const HINT = 'ПССС… попробуй нажать «~» (тильду) где-нибудь в портале';

const PHRASES = [
  'ping kkepka.local — будильник на первую пару установлен',
  'Все оценки хранятся у пингвина в /home/students',
  'sudo apt install motivation',
  'У пингвинов нет дедлайнов. У тебя — есть. Беги.',
  'Ядро загружено: kkepka-6.1-kkep-generic',
  'chmod +x твой_день',
  'Пингвин одобряет твой средний балл. Наверное.',
];

interface Burst {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  char: string;
  dur: number;
}

const BURST_CHARS = ['❄', '❆', '+', '*', '0', '1', '→'];

/**
 * Tux — пасхалка в футере welcome-страницы.
 * Клик: пингвин подпрыгивает, разлетаются снежинки/символы,
 * всплывает фраза. Каждые ~3 клика — подсказка про секретный терминал.
 */
export function Tux() {
  const [phrase, setPhrase] = useState<string | null>(null);
  const [jumping, setJumping] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const clicksRef = useRef<number | null>(null);
  const phraseTimer = useRef<number | undefined>(undefined);
  const burstId = useRef(0);

  const onJumpEnd = () => setJumping(false);

  const poke = () => {
    clicksRef.current = (clicksRef.current ?? Number(localStorage.getItem(CLICKS_KEY) ?? 0)) + 1;
    localStorage.setItem(CLICKS_KEY, String(clicksRef.current));

    setJumping(true);

    // Снежинки/символы разлетаются из центра пингвина.
    const burst: Burst[] = Array.from({ length: 9 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 50;
      return {
        id: ++burstId.current,
        x: 28 + Math.random() * 8,
        y: 34 + Math.random() * 8,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist + 26,
        char: BURST_CHARS[Math.floor(Math.random() * BURST_CHARS.length)],
        dur: 800 + Math.random() * 500,
      };
    });
    setBursts(burst);

    // Фраза: каждая третья — подсказка про «~», иначе случайная.
    const text = clicksRef.current % 3 === 0 ? HINT : PHRASES[Math.floor(Math.random() * PHRASES.length)];
    setPhrase(text);
    window.clearTimeout(phraseTimer.current);
    phraseTimer.current = window.setTimeout(() => setPhrase(null), 3400);
  };

  return (
    <div className="relative">
      {/* Всплывающая фраза */}
      {phrase && (
        <p className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max max-w-56 text-center text-[11px] leading-snug text-dark-text bg-dark-card border border-primary-500/30 rounded-xl px-3 py-1.5 shadow-lg shadow-primary-500/10">
          {phrase}
        </p>
      )}

      <style>{`
        @keyframes tux-bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes tux-jump { 0% { transform: translateY(0) scale(1) } 30% { transform: translateY(-16px) scale(1.06) rotate(-4deg) } 60% { transform: translateY(2px) scale(0.98) } 100% { transform: translateY(0) scale(1) } }
        @keyframes tux-burst { from { opacity: 1; transform: translate(0, 0) } to { opacity: 0; transform: translate(var(--dx), var(--dy)) } }
        .tux-img { animation: tux-bob 3.6s ease-in-out infinite; }
        .tux-img.tux-now { animation: tux-jump 0.5s ease-out; }
        .tux-burst { position: absolute; animation: tux-burst var(--dur, 900ms) ease-out forwards; color: #7dd3fc; font-size: 13px; pointer-events: none; user-select: none; }
        @media (prefers-reduced-motion: reduce) {
          .tux-img { animation: none; }
          .tux-burst { display: none; }
        }
      `}</style>

      <button
        type="button"
        onClick={poke}
        aria-label="Тук-тук, это пингвин Tux"
        className="block cursor-pointer hover:opacity-90 transition-opacity"
      >
        <span className={`tux-img block w-14 ${jumping ? 'tux-now' : ''}`} onAnimationEnd={onJumpEnd}>
          <svg viewBox="0 0 96 120" className="w-14 drop-shadow-[0_0_12px_rgba(56,189,248,0.25)]" aria-hidden="true">
            <ellipse cx="48" cy="66" rx="30" ry="44" fill="#111827" stroke="#38bdf8" strokeOpacity="0.35" strokeWidth="2" />
            <ellipse cx="48" cy="78" rx="18" ry="28" fill="#f8fafc" fillOpacity="0.92" />
            <circle cx="40" cy="42" r="3.6" fill="#0f172a" />
            <circle cx="56" cy="42" r="3.6" fill="#0f172a" />
            <circle cx="41.2" cy="40.8" r="1.1" fill="#f8fafc" />
            <circle cx="57.2" cy="40.8" r="1.1" fill="#f8fafc" />
            <path d="M42 50 Q48 58 54 50 Q48 55 42 50Z" fill="#fbbf24" />
            <path d="M20 58 Q6 78 20 94 Q28 80 32 64Z" fill="#111827" stroke="#38bdf8" strokeOpacity="0.25" />
            <path d="M76 58 Q90 78 76 94 Q68 80 64 64Z" fill="#111827" stroke="#38bdf8" strokeOpacity="0.25" />
            <path d="M38 106 q-8 8 0 10 q10 2 14 -3z" fill="#fbbf24" />
            <path d="M58 106 q8 8 0 10 q-10 2 -14 -3z" fill="#fbbf24" />
          </svg>
        </span>
      </button>

      {/* Разлетающиеся частицы */}
      {bursts.map((b) => (
        <span
          key={b.id}
          className="tux-burst"
          onAnimationEnd={() => setBursts((bs) => bs.filter((q) => q.id !== b.id))}
          style={
            {
              left: b.x,
              top: b.y,
              '--dx': `${b.dx}px`,
              '--dy': `${b.dy}px`,
              animationDuration: `${b.dur}ms`,
            } as React.CSSProperties
          }
        >
          {b.char}
        </span>
      ))}
    </div>
  );
}
