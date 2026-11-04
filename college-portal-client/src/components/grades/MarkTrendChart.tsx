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

/** Thresholds match the app-wide color scale: 2–3.5 красный, 3.5–4.5 жёлтый, выше зелёный. */
export function valueColor(value: number): 'red' | 'amber' | 'emerald' {
  if (value < 3.5) return 'red';
  if (value < 4.5) return 'amber';
  return 'emerald';
}

const STROKE_CLASSES: Record<'red' | 'amber' | 'emerald', string> = {
  red: 'stroke-red-400',
  amber: 'stroke-amber-400',
  emerald: 'stroke-emerald-400',
};

const FILL_CLASSES: Record<'red' | 'amber' | 'emerald', string> = {
  red: 'fill-red-400',
  amber: 'fill-amber-400',
  emerald: 'fill-emerald-400',
};

/**
 * Animated SVG line chart of a value over time. Drawn without chart
 * libraries: segments are colored by the mark-value zones (red threshold
 * ranges), the draw animation runs across the whole polyline, and a
 * last-point dot fades in after the line pass.
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

    const xy = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value), v: p.value }));

    // Per-segment geometry: each segment is its own path colored by the zone
    // of the value between its endpoints.
    const segments: Array<{ d: string; len: number; color: 'red' | 'amber' | 'emerald' }> = [];
    let cumBefore: number[] = [0];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = xy[i - 1];
      const b = xy[i];
      segments.push({
        d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        len: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        color: valueColor((a.v + b.v) / 2),
      });
      total += segments[segments.length - 1].len;
      cumBefore.push(total);
    }
    total = Math.max(total, 1);

    // Single-point case: no segments, just a colored dot.
    return {
      xy,
      segments,
      cumBefore,
      total,
      lastX: xy[xy.length - 1].x,
      lastY: xy[xy.length - 1].y,
      lastColor: valueColor(xy[xy.length - 1].v),
      gridLines: [2, 3, 4, 5].map((v) => ({ value: v, y: yAt(v) })),
    };
  }, [points]);

  if (!geometry) {
    return (
      <div className="text-sm text-dark-textMuted text-center py-8">Пока нет оценок для графика</div>
    );
  }

  // Global drawn length; each segment gets its share of the sweep.
  const drawn = geometry.total * drawProgress;

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

      {points.length > 1 && geometry.segments.map((seg, i) => {
        const drawnInSeg = Math.max(0, Math.min(seg.len, drawn - geometry.cumBefore[i]));
        const offset = seg.len - drawnInSeg;
        return (
          <path
            key={i}
            d={seg.d}
            fill="none"
            className={STROKE_CLASSES[seg.color]}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={seg.len}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 80ms linear' }}
          />
        );
      })}

      {/* dots on each drawn point colored by its zone */}
      {geometry.xy.map((p, i) => {
        const visible = points.length === 1 || (drawn >= geometry.cumBefore[Math.max(0, i)] && drawProgress > 0);
        if (!visible || i === geometry.xy.length - 1) return null;
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2.5}
            className={FILL_CLASSES[valueColor(p.v)]}
            opacity={Math.min(1, drawProgress * 2)}
          />
        );
      })}

      {drawProgress >= 0.98 && (
        <circle
          cx={geometry.lastX}
          cy={geometry.lastY}
          r={4}
          className={FILL_CLASSES[geometry.lastColor]}
          opacity={1}
        />
      )}
    </svg>
  );
}
