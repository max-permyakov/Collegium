import { useEffect, useRef } from 'react';

const CHARS = 'アイウエオカキクケコサシスセソナニヌネノ0123456789<>{}[]()=/*+-#@$%&;:';

/** Цвет фона портала (#0f172a) — им «затираем» кадр, получается шлейф. */
const TRAIL_BG = 'rgba(15, 23, 42, 0.15)';
const HEAD_COLOR = 'rgba(125, 211, 252, 0.55)'; // sky-300
const GLOW_COLOR = 'rgba(165, 220, 253, 0.95)'; // рядом с курсором

interface MatrixRainProps {
  className?: string;
  /** Расстояние между колонками символов, px (больше — реже). */
  columnGap?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  char: string;
  size: number;
}

interface Column {
  y: number;
  speed: number;
  tick: number;
}

/**
 * «Матричный» фон-вкладка: падающие колонки символов на canvas 2D.
 * Интерактив: символы возле курсора подсвечиваются, а от самого курсора
 * разлетаются и тают частицы-символы («расплывающиеся символы»).
 * При prefers-reduced-motion рисуется один статичный кадр, цикла нет.
 */
export function MatrixRain({ className, columnGap = 16 }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fontSize = 14;
    const GLOW_RADIUS = 120;
    const STEP_MS = 40;

    let width = 0;
    let height = 0;
    let columns: Column[] = [];
    const particles: Particle[] = [];
    const pointer = { x: -9999, y: -9999 };
    let raf = 0;
    let lastStep = 0;
    let lastSpawn = 0;
    let paused = document.hidden;

    const randomChar = () => CHARS[Math.floor(Math.random() * CHARS.length)];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.max(1, Math.ceil(width / columnGap));
      columns = Array.from({ length: cols }, () => ({
        y: Math.floor(Math.random() * (height / fontSize + 40)) - 40,
        speed: 0.6 + Math.random() * 0.8,
        tick: 0,
      }));
    };

    const spawnParticles = (x: number, y: number) => {
      if (particles.length > 140) return;
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const vel = 0.4 + Math.random() * 1.1;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * vel,
          vy: Math.sin(angle) * vel - 0.2,
          life: 1,
          char: randomChar(),
          size: 11 + Math.random() * 8,
        });
      }
    };

    const onMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      const now = performance.now();
      if (now - lastSpawn > 60) {
        lastSpawn = now;
        spawnParticles(e.clientX, e.clientY);
      }
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };
    const onVisibility = () => {
      paused = document.hidden;
    };

    /** Один статичный кадр для prefers-reduced-motion. */
    const drawStatic = () => {
      ctx.fillStyle = 'rgb(15, 23, 42)';
      ctx.fillRect(0, 0, width, height);
      ctx.font = `${fontSize}px ui-monospace, monospace`;
      for (let x = columnGap / 2; x < width; x += columnGap) {
        for (let y = fontSize; y < height; y += fontSize * 2.5) {
          ctx.fillStyle = `rgba(56, 189, 248, ${0.04 + Math.random() * 0.07})`;
          ctx.fillText(randomChar(), x, y);
        }
      }
    };

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (paused || time - lastStep < STEP_MS) return;
      lastStep = time;

      // Затирание фоном даёт шлейф от предыдущих символов.
      ctx.fillStyle = TRAIL_BG;
      ctx.fillRect(0, 0, width, height);
      ctx.font = `${fontSize}px ui-monospace, monospace`;

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const prevCell = Math.floor(col.y);
        col.tick += col.speed;
        if (col.tick < 1) continue; // медленные колонки пропускают шаги
        col.tick = 0;

        // Ровно на клетку вниз за шаг и один символ за шаг — без наложения
        // в одну ячейку, иначе символы «размазываются» по вертикали.
        col.y = prevCell + 1;
        if (col.y * fontSize > height + 60) {
          if (Math.random() < 0.06) col.y = -Math.floor(Math.random() * 20);
          continue;
        }

        const x = i * columnGap;
        const y = col.y * fontSize;
        const dist = Math.hypot(pointer.x - x, pointer.y - y);
        ctx.fillStyle = dist < GLOW_RADIUS ? GLOW_COLOR : HEAD_COLOR;
        ctx.fillText(randomChar(), x, y);
      }

      // Частицы, разлетающиеся от курсора.
      for (let p = particles.length - 1; p >= 0; p--) {
        const pt = particles[p];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.02;
        pt.life -= 0.025;
        if (pt.life <= 0) {
          particles.splice(p, 1);
          continue;
        }
        ctx.globalAlpha = pt.life;
        ctx.fillStyle = GLOW_COLOR;
        ctx.font = `${pt.size}px ui-monospace, monospace`;
        ctx.fillText(pt.char, pt.x, pt.y);
      }
      ctx.globalAlpha = 1;
    };

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);

    if (reduced) {
      drawStatic();
    } else {
      window.addEventListener('mousemove', onMove);
      document.documentElement.addEventListener('mouseleave', onLeave);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [columnGap]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none block ${className ?? ''}`}
    />
  );
}
