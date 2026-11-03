import { useEffect, useMemo, useRef, useState } from 'react';

export interface TrendPoint {
  day: string;
  value: number;
}

const W = 600;
const H = 180;
const PAD_X = 34;
const PAD_Y = 18;
const STROKE = 3;

/**
 * Animated SVG line chart of a value over time. Drawn without chart
 * libraries: a single path with a stroke-dash "draw" animation and a
 * last-point dot that fades in after the line pass.
 */
export function MarkTrendChart({
  points,
  className = '',
  height = 180,
}: {
  points: TrendPoint[];
  className?: string;
  height?: number;
}) {
  const [drawProgress, setDrawProgress] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic for a lively, decelerating draw.
      setDrawProgress(1 - Math.pow(1 - t, 3));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [points]);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values, 3) - 0.1;
    const max = Math.max(...values, 5) + 0.05;

    const xAt = (i: number) =>
      PAD_X + (points.length === 1 ? (W - PAD_X * 2) / 2 : (i / (points.length - 1)) * (W - PAD_X * 2));
    const yAt = (v: number) => PAD_Y + (1 - (v - min) / (max - min)) * (H - PAD_Y * 2);

    let path = '';
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(p.value);
      path += i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    // Total polyline length for the stroke-dash draw animation.
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
      const dx = xAt(i) - xAt(i - 1);
      const dy = yAt(points[i].value) - yAt(points[i - 1].value);
      length += Math.hypot(dx, dy);
    }
    length = Math.max(length, 1);

    return {
      path,
      length,
      lastX: xAt(points.length - 1),
      lastY: yAt(values[values.length - 1]),
      gridLines: [2, 3, 4, 5].map((v) => ({ value: v, y: yAt(v) })),
    };
  }, [points]);

  if (!geometry) {
    return (
      <div className="text-sm text-dark-textMuted text-center py-8">Пока нет оценок для графика</div>
    );
  }

  const dashOffset = geometry.length * (1 - drawProgress);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ height }}
      className={`w-full select-none ${className}`}
      role="img"
      aria-label="График среднего балла"
    >
      {/* value gridlines: 2..5 keep the mark scale readable */}
      {geometry.gridLines.map((line) => (
        <g key={line.value}>
          <line
            x1={PAD_X}
            x2={W - PAD_X / 2}
            y1={line.y}
            y2={line.y}
            className="stroke-dark-border"
            strokeWidth={1}
            strokeDasharray="4 6"
          />
          <text x={8} y={line.y + 4} className="fill-dark-textMuted" fontSize={12}>
            {line.value}
          </text>
        </g>
      ))}

      {/* faint background path, then the animated stroke racing across it */}
      <path
        d={geometry.path}
        fill="none"
        className="stroke-primary-500/20"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={geometry.path}
        fill="none"
        className="stroke-primary-400"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={geometry.length}
        strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 80ms linear' }}
      />
      {drawProgress >= 0.98 && (
        <circle
          cx={geometry.lastX}
          cy={geometry.lastY}
          r={4}
          className="fill-primary-400"
          opacity={1}
        />
      )}
    </svg>
  );
}
