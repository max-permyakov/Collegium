import { useEffect, useRef, useState } from "react";
import type { AuditoriumDto, CollegeMapDto } from "../../types";

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
  activeFloor?: number | "none" | null;
  onSelect: (auditorium: AuditoriumDto) => void;
  previewRect?: PreviewRect | null;
  onMapClick?: (x: number, y: number) => void;
  onPreviewDrag?: (x: number, y: number) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
// Movement threshold (px) distinguishing a tap/click from a pan gesture.
const TAP_THRESHOLD = 8;

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
  const outerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  const dragState = useRef<{
    startX: number;
    startY: number;
    rectX: number;
    rectY: number;
  } | null>(null);
  const pendingTap = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(
    null,
  );

  // Zoom while keeping the anchor point (cursor or viewport center) in place.
  const zoomAt = (newZoom: number, anchorX?: number, anchorY?: number) => {
    const outer = outerRef.current;
    const inner = containerRef.current;
    zoomRef.current = newZoom;
    if (!outer || !inner) {
      setZoom(newZoom);
      return;
    }
    const oRect = outer.getBoundingClientRect();
    const rect = inner.getBoundingClientRect();
    const ax = anchorX ?? oRect.left + oRect.width / 2;
    const ay = anchorY ?? oRect.top + oRect.height / 2;
    const fx = rect.width > 0 ? (ax - rect.left) / rect.width : 0.5;
    const fy = rect.height > 0 ? (ay - rect.top) / rect.height : 0.5;
    setZoom(newZoom);
    requestAnimationFrame(() => {
      const rect2 = inner.getBoundingClientRect();
      outer.scrollLeft += rect2.left + fx * rect2.width - ax;
      outer.scrollTop += rect2.top + fy * rect2.height - ay;
    });
  };

  // Desktop: Ctrl/Cmd + wheel (trackpad pinch) zooms around the cursor.
  // Mobile: two-finger pinch zooms around the fingers midpoint, while
  // single-finger panning stays native (touch-action allows scrolling).
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      zoomAt(
        clamp(zoomRef.current * factor, MIN_ZOOM, MAX_ZOOM),
        e.clientX,
        e.clientY,
      );
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) {
        pinchRef.current = null;
        return;
      }
      const [t1, t2] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        cx: (t1.clientX + t2.clientX) / 2,
        cy: (t1.clientY + t2.clientY) / 2,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (pinchRef.current.dist === 0) return;
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      const ratio = dist / pinchRef.current.dist;
      pinchRef.current = { dist, cx, cy };
      zoomAt(clamp(zoomRef.current * ratio, MIN_ZOOM, MAX_ZOOM), cx, cy);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    outer.addEventListener("wheel", handleWheel, { passive: false });
    outer.addEventListener("touchstart", handleTouchStart, { passive: true });
    outer.addEventListener("touchmove", handleTouchMove, { passive: false });
    outer.addEventListener("touchend", handleTouchEnd, { passive: true });
    outer.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      outer.removeEventListener("wheel", handleWheel);
      outer.removeEventListener("touchstart", handleTouchStart);
      outer.removeEventListener("touchmove", handleTouchMove);
      outer.removeEventListener("touchend", handleTouchEnd);
      outer.removeEventListener("touchcancel", handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Placement happens on pointerup so that touch panning across the map
    // does not accidentally move the auditorium.
    pendingTap.current = { x: e.clientX, y: e.clientY };
  };

  const handleBackgroundPointerUp = (e: React.PointerEvent) => {
    const start = pendingTap.current;
    pendingTap.current = null;
    if (!onMapClick || !start) return;
    if (
      Math.abs(e.clientX - start.x) > TAP_THRESHOLD ||
      Math.abs(e.clientY - start.y) > TAP_THRESHOLD
    )
      return;
    const p = toMapCoords(e.clientX, e.clientY);
    if (p) onMapClick(p.x, p.y);
  };

  const handleBackgroundPointerCancel = () => {
    pendingTap.current = null;
  };

  const handlePreviewPointerDown = (e: React.PointerEvent) => {
    if (!previewRect || !onPreviewDrag) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      rectX: previewRect.x,
      rectY: previewRect.y,
    };
  };

  const handlePreviewPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !onPreviewDrag || !previewRect) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx =
      ((e.clientX - dragState.current.startX) / r.width) * map.mapWidth;
    const dy =
      ((e.clientY - dragState.current.startY) / r.height) * map.mapHeight;
    const nx = clamp(
      dragState.current.rectX + dx,
      0,
      map.mapWidth - previewRect.width,
    );
    const ny = clamp(
      dragState.current.rectY + dy,
      0,
      map.mapHeight - previewRect.height,
    );
    onPreviewDrag(Math.round(nx), Math.round(ny));
  };

  const handlePreviewPointerUp = (e: React.PointerEvent) => {
    dragState.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={outerRef}
      className="overflow-auto rounded-2xl border border-dark-border bg-dark-surface p-2"
    >
      <div
        ref={containerRef}
        className="relative mx-auto"
        style={{
          aspectRatio: `${map.mapWidth} / ${map.mapHeight}`,
          width: `calc(min(100%, 72vh * ${aspect}) * ${zoom})`,
        }}
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
            pointerEvents={onMapClick ? "all" : "none"}
            style={{ cursor: onMapClick ? "crosshair" : "default" }}
            onPointerDown={handleBackgroundPointerDown}
            onPointerUp={handleBackgroundPointerUp}
            onPointerCancel={handleBackgroundPointerCancel}
          />

          {map.auditoriums.map((a) => {
            const isSelected = a.id === selectedId;
            const isHighlighted = highlighted.has(a.id);
            const buildingMismatch =
              Boolean(activeBuildingId) && a.buildingId !== activeBuildingId;
            const floorMismatch =
              activeFloor != null &&
              (activeFloor === "none"
                ? a.floor != null
                : a.floor !== activeFloor);
            const dimmed = buildingMismatch || floorMismatch;

            const fill = isSelected
              ? "rgba(245, 158, 11, 0.65)"
              : isHighlighted
                ? "rgba(34, 197, 94, 0.6)"
                : "rgba(96, 165, 250, 0.3)";
            const stroke = isSelected
              ? "#f59e0b"
              : isHighlighted
                ? "#22c55e"
                : "#60a5fa";

            return (
              <g
                key={a.id}
                onClick={() => onSelect(a)}
                className="cursor-pointer"
                style={{
                  opacity: dimmed ? 0.08 : 1,
                  transition: "opacity 200ms",
                }}
              >
                <title>
                  {`Ауд. ${a.number}${a.displayName ? ` — ${a.displayName}` : ""} (${a.buildingName})`}
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
            <g style={{ cursor: onPreviewDrag ? "move" : "default" }}>
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
                style={{ touchAction: "none" }}
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
