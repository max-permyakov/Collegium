import { useRef } from 'react';
import type { AuditoriumDto, CollegeMapDto } from '../../types';

export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

interface CollegeMapProps {
  map: CollegeMapDto;
  selectedId?: string | null;
  highlightIds?: string[];
  activeBuildingId?: string | null;
  activeFloor?: number | 'none' | null;
  onSelect: (auditorium: AuditoriumDto) => void;
  previewRect?: PreviewRect | null;
  onMapClick?: (x: number, y: number) => void;
  onPreviewDrag?: (x: number, y: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function CollegeMap({
  map,
  selectedId,
  highlightIds = [],
  activeBuildingId,
  activeFloor = null,
  onSelect,
  previewRect = null,
  onMapClick,
  onPreviewDrag,
}: CollegeMapProps) {
  const aspect = map.mapWidth / map.mapHeight;
  const highlighted = new Set(highlightIds);
  const containerRef = useRef<HTMLDivElement>(null);

  const dragState = useRef<{ startX: number; startY: number; rectX: number; rectY: number } | null>(null);

  const toMapCoords = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(((clientX - r.left) / r.width) * map.mapWidth),
      y: Math.round(((clientY - r.top) / r.height) * map.mapHeight),
    };
  };

  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    if (!onMapClick) return;
    const p = toMapCoords(e.clientX, e.clientY);
    if (p) onMapClick(p.x, p.y);
  };

  const handlePreviewPointerDown = (e: React.PointerEvent) => {
    if (!previewRect || !onPreviewDrag) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, rectX: previewRect.x, rectY: previewRect.y };
  };

  const handlePreviewPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !onPreviewDrag || !previewRect) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - dragState.current.startX) / r.width) * map.mapWidth;
    const dy = ((e.clientY - dragState.current.startY) / r.height) * map.mapHeight;
    const nx = clamp(dragState.current.rectX + dx, 0, map.mapWidth - previewRect.width);
    const ny = clamp(dragState.current.rectY + dy, 0, map.mapHeight - previewRect.height);
    onPreviewDrag(Math.round(nx), Math.round(ny));
  };

  const handlePreviewPointerUp = (e: React.PointerEvent) => {
    dragState.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div className="overflow-auto rounded-2xl border border-dark-border bg-dark-surface p-2">
      <div
        ref={containerRef}
        className="relative mx-auto touch-none"
        style={{ aspectRatio: `${map.mapWidth} / ${map.mapHeight}`, width: `min(100%, calc(72vh * ${aspect}))` }}
      >
        <img
          src="/college-map.png"
          alt="Схема территории колледжа"
          className="absolute inset-0 h-full w-full select-none object-contain"
          draggable={false}
        />
        <svg
          viewBox={`0 0 ${map.mapWidth} ${map.mapHeight}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect
            width={map.mapWidth}
            height={map.mapHeight}
            fill="transparent"
            pointerEvents={onMapClick ? 'all' : 'none'}
            style={{ cursor: onMapClick ? 'crosshair' : 'default' }}
            onPointerDown={handleBackgroundPointerDown}
          />

          {map.auditoriums.map((a) => {
            const isSelected = a.id === selectedId;
            const isHighlighted = highlighted.has(a.id);
            const buildingMismatch = Boolean(activeBuildingId) && a.buildingId !== activeBuildingId;
            const floorMismatch =
              activeFloor != null &&
              (activeFloor === 'none' ? a.floor != null : a.floor !== activeFloor);
            const dimmed = buildingMismatch || floorMismatch;

            const fill = isSelected
              ? 'rgba(245, 158, 11, 0.65)'
              : isHighlighted
                ? 'rgba(34, 197, 94, 0.6)'
                : 'rgba(96, 165, 250, 0.3)';
            const stroke = isSelected ? '#f59e0b' : isHighlighted ? '#22c55e' : '#60a5fa';

            return (
              <g
                key={a.id}
                onClick={() => onSelect(a)}
                className="cursor-pointer"
                style={{ opacity: dimmed ? 0.08 : 1, transition: 'opacity 200ms' }}
              >
                <title>
                  {`Ауд. ${a.number}${a.displayName ? ` — ${a.displayName}` : ''} (${a.buildingName})`}
                </title>
                <rect
                  x={a.x}
                  y={a.y}
                  width={a.width}
                  height={a.height}
                  rx={8}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSelected || isHighlighted ? 6 : 3}
                />
                {a.width >= 90 && a.height >= 40 && (
                  <text
                    x={a.x + a.width / 2}
                    y={a.y + a.height / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={34}
                    fontWeight={700}
                    fill="#e5e7eb"
                    pointerEvents="none"
                  >
                    {a.number}
                  </text>
                )}
              </g>
            );
          })}

          {previewRect && (
            <g style={{ cursor: onPreviewDrag ? 'move' : 'default' }}>
              <rect
                x={previewRect.x}
                y={previewRect.y}
                width={previewRect.width}
                height={previewRect.height}
                rx={8}
                fill="rgba(245, 158, 11, 0.35)"
                stroke="#f59e0b"
                strokeWidth={6}
                strokeDasharray="16 10"
                onPointerDown={handlePreviewPointerDown}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
              />
              {previewRect.label && (
                <text
                  x={previewRect.x + previewRect.width / 2}
                  y={previewRect.y + previewRect.height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={34}
                  fontWeight={700}
                  fill="#fef3c7"
                  pointerEvents="none"
                >
                  {previewRect.label}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
