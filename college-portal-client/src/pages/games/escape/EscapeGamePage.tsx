import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesApi } from '../../../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { escapeModeById, escapeModes } from './gameModes';
import type { GameLeaderboard, GameModeId } from '../../../types';

const GAME_ID = 'escape';
const LOGICAL_W = 900;
const LOGICAL_H = 300;
const GROUND_H = 50;
const GROUND_Y = LOGICAL_H - GROUND_H;
const PLAYER_X = 150;
const TRAIL_X = 80;
const STAND_H = 66;
const STAND_W = 46;
const DUCK_H = 34;
const DUCK_W = 56;
const JUMP_VY = -12.4;
const GRAVITY = 0.5;
const START_SPEED = 5.2;
const MAX_SPEED = 100.5;
const ACCEL = 0.0001;
const FLY_CHANCE = 0.3;
const MIN_GAP = 260;
const HIT_MARGIN = 7;
const SCORE_DIVISOR = 8;
const PLAYER_SPRITE_URL = '/games/player.png';
const TRAIL_MIN_DELAY = 6;
const TRAIL_MAX_DELAY = 14;
const TRAIL_ALPHA = 1;

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  style: 'badge' | 'glyph' | 'wave';
  accent: string;
  image?: string;
}

interface TrailPoint {
  alt: number;
  ducking: boolean;
}

interface RunState {
  status: 'idle' | 'running' | 'over';
  speed: number;
  runDistance: number;
  spawnAcc: number;
  spawnGap: number;
  alt: number;
  vy: number;
  grounded: boolean;
  holdDuck: boolean;
  obstacles: Obstacle[];
  trail: TrailPoint[];
  trailAcc: number;
  frameBlink: number;
  hiScore: number;
}

interface RefsBundle {
  sprite: HTMLImageElement | null;
  spriteReady: boolean;
  imageCache: Map<string, HTMLImageElement>;
}

const spacesForSpeed = (speed: number) => MIN_GAP + speed * 30;

const randomOf = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const formatScore = (score: number) => String(score).padStart(5, '0');

const medalFor = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const EscapeGamePage = () => {
  const [mode, setMode] = useState<GameModeId>('physics');
  const config = escapeModeById(mode);

  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const [board, setBoard] = useState<{
    mode: GameModeId;
    version: number;
    data: GameLeaderboard | null;
    failed: boolean;
  }>({ mode: 'physics', version: 0, data: null, failed: false });
  const isBoardLoading = board.mode !== mode || board.version !== leaderboardKey;
  const shownBoard = isBoardLoading ? null : board.data;
  const boardFailed = shownBoard == null && board.failed;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef<RunState>({
    status: 'idle',
    speed: START_SPEED,
    runDistance: 0,
    spawnAcc: 0,
    spawnGap: spacesForSpeed(START_SPEED),
    alt: 0,
    vy: 0,
    grounded: true,
    holdDuck: false,
        obstacles: [],
        trail: [],
        trailAcc: 0,
        frameBlink: 0,
    hiScore: 0,
  });
  const refsRef = useRef<RefsBundle>({ sprite: null, spriteReady: false, imageCache: new Map() });
  const hiScoreRef = useRef(0);
  const onGameOverRef = useRef<(score: number) => void>(() => {});

  const handleGameOver = useCallback((score: number) => {
    gamesApi.submitScore(GAME_ID, mode, score)
      .then((r) => {
        if (r.data?.personalBest != null) hiScoreRef.current = r.data.personalBest;
        setLeaderboardKey((v) => v + 1);
      })
      .catch(() => {});
  }, [mode]);

  useEffect(() => {
    onGameOverRef.current = handleGameOver;
  }, [handleGameOver]);

  useEffect(() => {
    let alive = true;
    gamesApi.getLeaderboard(GAME_ID, mode)
      .then((r) => {
        if (!alive) return;
        if (r.data?.currentUserBest != null) hiScoreRef.current = r.data.currentUserBest;
        setBoard({ mode, version: leaderboardKey, data: r.data, failed: false });
      })
      .catch(() => {
        if (alive) setBoard({ mode, version: leaderboardKey, data: null, failed: true });
      });
    return () => { alive = false; };
  }, [mode, leaderboardKey]);

  const jump = useCallback(() => {
    const s = runRef.current;
    if (s.status === 'idle') {
      s.status = 'running';
    }
    if (s.status === 'over') {
      const hi = hiScoreRef.current;
      runRef.current = {
        status: 'running',
        speed: START_SPEED,
        runDistance: 0,
        spawnAcc: 0,
        spawnGap: spacesForSpeed(START_SPEED),
        alt: 0,
        vy: 0,
        grounded: true,
        holdDuck: false,
        obstacles: [],
        trail: [],
        trailAcc: 0,
        frameBlink: 0,
        hiScore: hi,
      };
      return;
    }
    if (s.grounded) {
      s.vy = JUMP_VY;
      s.grounded = false;
      s.holdDuck = false;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bundle = refsRef.current;

    const sprite = new Image();
    sprite.loading = 'eager';
    sprite.src = PLAYER_SPRITE_URL;
    bundle.sprite = sprite;
    sprite.onload = () => { bundle.spriteReady = true; };
    sprite.onerror = () => { bundle.spriteReady = false; };

    const getImage = (src: string) => {
      let img = bundle.imageCache.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        bundle.imageCache.set(src, img);
      }
      return img;
    };

    for (const item of [...config.groundItems, ...config.flyingItems]) {
      if (item.image) getImage(item.image);
    }
    getImage(config.trailImage);

    {
      const hi = hiScoreRef.current;
      runRef.current = {
        status: 'idle',
        speed: START_SPEED,
        runDistance: 0,
        spawnAcc: 0,
        spawnGap: spacesForSpeed(START_SPEED),
        alt: 0,
        vy: 0,
        grounded: true,
        holdDuck: false,
    obstacles: [],
    trail: [],
    trailAcc: 0,
    frameBlink: 0,
        hiScore: hi,
      };
    }

    let raf = 0;
    let lastTime = performance.now();
    const STEP = 1000 / 60;

    const spreadFont = (size: number) => `bold ${size}px "Segoe UI", system-ui, sans-serif`;

    const spawnObstacle = () => {
      const s = runRef.current;
      const useFlying = Math.random() < FLY_CHANCE;
      const specs = useFlying ? config.flyingItems : config.groundItems;
      const spec = randomOf(specs);
      let w: number;
      let h: number;
      if (spec.image) {
        h = spec.imageHeight ?? (useFlying ? 40 : 56);
        w = spec.imageWidth ?? Math.round(h * 1.4);
      } else if (spec.style === 'glyph') {
        h = 34;
        w = h * (spec.text.length > 2 ? 1.4 : 1);
      } else if (spec.style === 'wave') {
        h = 16;
        w = 96;
      } else {
        h = 40;
        ctx.font = spreadFont(15);
        w = Math.max(48, ctx.measureText(spec.text).width + 22);
      }
      const yTop = useFlying ? GROUND_Y - DUCK_H - 6 - h : GROUND_Y - h;
      s.obstacles.push({
        x: LOGICAL_W + 30,
        y: yTop,
        w,
        h,
        text: spec.text,
        style: spec.style,
        accent: config.accent,
        image: spec.image,
      });
      s.spawnGap = spacesForSpeed(s.speed) + Math.random() * 220;
      s.spawnAcc = 0;
    };

    const stepPhysics = (dt: number) => {
      const s = runRef.current;
      if (s.status !== 'running') return;

      const scale = dt / STEP;
      s.speed = Math.min(MAX_SPEED, START_SPEED + s.runDistance * ACCEL);
      const move = s.speed * scale;
      s.runDistance += move;
      s.spawnAcc += move;

      if (!s.grounded) {
        s.vy += GRAVITY * scale;
        s.alt -= s.vy * scale;
        if (s.alt <= 0) {
          s.alt = 0;
          s.vy = 0;
          s.grounded = true;
        }
      }

      const ducking = s.grounded && s.holdDuck;
      const pH = ducking ? DUCK_H : STAND_H;
      const pW = ducking ? DUCK_W : STAND_W;
      const pTop = GROUND_Y - s.alt - pH;

      s.trailAcc += dt;
      while (s.trailAcc >= STEP) {
        s.trailAcc -= STEP;
        s.trail.push({ alt: s.alt, ducking });
        if (s.trail.length > TRAIL_MAX_DELAY + 4) s.trail.shift();
      }

      if (s.spawnAcc >= s.spawnGap) spawnObstacle();

      for (const o of s.obstacles) {
        o.x -= move;
        const overlapX = PLAYER_X + HIT_MARGIN < o.x + o.w - HIT_MARGIN &&
          PLAYER_X + pW - HIT_MARGIN > o.x + HIT_MARGIN;
        const overlapY = pTop + HIT_MARGIN < o.y + o.h - HIT_MARGIN &&
          pTop + pH - HIT_MARGIN > o.y + HIT_MARGIN;
        if (overlapX && overlapY) {
          s.status = 'over';
          onGameOverRef.current(Math.floor(s.runDistance / SCORE_DIVISOR));
          break;
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > -40);
    };

    const drawObstacle = (o: Obstacle) => {
      ctx.save();
      if (o.image) {
        const img = bundle.imageCache.get(o.image);
        if (img && img.complete && img.naturalWidth > 0) {
          const scale = Math.min(o.w / img.naturalWidth, o.h / img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, o.x + (o.w - dw) / 2, o.y + (o.h - dh) / 2, dw, dh);
          ctx.restore();
          return;
        }
      }
      if (o.style === 'wave') {
        ctx.strokeStyle = o.accent;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const yMid = o.y + o.h / 2 + Math.sin(o.x * 0.05) * 3;
        ctx.moveTo(o.x, yMid);
        const seg = 6;
        for (let i = 1; i <= seg; i++) {
          const x = o.x + (o.w * i) / seg;
          const y = yMid + (i % 2 === 0 ? -o.h : o.h) * 0.6;
          ctx.quadraticCurveTo(
            o.x + (o.w * (i - 0.5)) / seg,
            yMid + (i % 2 === 0 ? o.h : -o.h) * 1.1,
            x,
            y,
          );
        }
        ctx.stroke();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = o.accent;
        ctx.font = spreadFont(11);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(o.text, o.x + o.w / 2, o.y - 4);
      } else {
        if (o.style === 'badge') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = o.accent;
          ctx.lineWidth = 1.5;
          roundRect(ctx, o.x, o.y, o.w, o.h, 8);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = o.accent;
        ctx.textAlign = 'center';
        if (o.style === 'glyph') {
          ctx.font = "30px 'Segoe UI Emoji', 'Segoe UI', system-ui, sans-serif";
          ctx.textBaseline = 'bottom';
          ctx.fillText(o.text, o.x + o.w / 2, o.y + o.h);
        } else {
          ctx.font = spreadFont(15);
          ctx.textBaseline = 'middle';
          ctx.fillText(o.text, o.x + o.w / 2, o.y + o.h / 2);
        }
      }
      ctx.restore();
    };

    const drawFitted = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh), dw, dh);
    };

    const drawTrail = () => {
      const s = runRef.current;
      if (s.trail.length === 0) return;
      const delay = Math.min(
        TRAIL_MAX_DELAY,
        Math.max(TRAIL_MIN_DELAY, Math.round(5 + s.speed * 0.55)),
      );
      const point = s.trail[s.trail.length - 1 - delay];
      if (!point) return;
      const pH = point.ducking ? DUCK_H : STAND_H;
      const pW = point.ducking ? DUCK_W : STAND_W;
      const pTop = GROUND_Y - point.alt - pH;
      const gx = TRAIL_X - Math.min(64, Math.round(s.speed * delay));
      const trailImg = bundle.imageCache.get(config.trailImage);
      ctx.save();
      ctx.globalAlpha = TRAIL_ALPHA;
      if (trailImg && trailImg.complete && trailImg.naturalWidth > 0) {
        drawFitted(trailImg, gx, pTop, pW, pH);
      } else if (bundle.spriteReady && bundle.sprite) {
        drawFitted(bundle.sprite, gx, pTop, pW, pH);
      } else {
        ctx.fillStyle = s.status === 'over' ? '#64748b' : config.accent;
        roundRect(ctx, gx, pTop, pW, pH, 10);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawPlayer = () => {
      const s = runRef.current;
      const ducking = s.grounded && s.holdDuck && s.status === 'running';
      const pH = ducking ? DUCK_H : STAND_H;
      const pW = ducking ? DUCK_W : STAND_W;
      const pTop = GROUND_Y - s.alt - pH;
      ctx.save();
      if (bundle.spriteReady && bundle.sprite) {
        drawFitted(bundle.sprite, PLAYER_X, pTop, pW, pH);
      } else {
        ctx.fillStyle = s.status === 'over' ? '#64748b' : '#38bdf8';
        roundRect(ctx, PLAYER_X, pTop, pW, pH, 10);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        const eyeY = pTop + pH * 0.32;
        if (Math.floor(s.frameBlink / 100) % 8 === 0) {
          ctx.fillRect(PLAYER_X + pW * 0.58, eyeY, pW * 0.2, 3);
          ctx.fillRect(PLAYER_X + pW * 0.84, eyeY, pW * 0.12, 3);
        } else {
          const r = Math.max(2, pW * 0.06);
          ctx.beginPath();
          ctx.arc(PLAYER_X + pW * 0.66, eyeY, r, 0, Math.PI * 2);
          ctx.arc(PLAYER_X + pW * 0.88, eyeY, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillRect(PLAYER_X + pW * (ducking ? 0.85 : 0.9), pTop + pH * 0.55, 3, pH * 0.1);
      }
      ctx.restore();
    };

    const draw = () => {
      const s = runRef.current;
      ctx.save();
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      const sky = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
      sky.addColorStop(0, '#0c1424');
      sky.addColorStop(1, 'rgba(12, 20, 36, 0.4)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      ctx.strokeStyle = s.status === 'over' ? '#475569' : config.accent;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 0.5);
      ctx.lineTo(LOGICAL_W, GROUND_Y + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      const offset = Math.floor(s.runDistance) % 34;
      ctx.beginPath();
      for (let x = -offset; x < LOGICAL_W; x += 34) {
        ctx.moveTo(x, GROUND_Y + 14);
        ctx.lineTo(x + 12, GROUND_Y + 14);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      for (const o of s.obstacles) drawObstacle(o);
      drawTrail();
      drawPlayer();

      const score = Math.floor(s.runDistance / SCORE_DIVISOR);
      ctx.fillStyle = '#f1f5f9';
      ctx.font = spreadFont(16);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`${formatScore(score)}  HI ${formatScore(hiScoreRef.current)}`, LOGICAL_W - 16, 14);

      if (s.status === 'idle') {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '15px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Пробел / клик — прыгать, ↓ — пригнуться', LOGICAL_W / 2, LOGICAL_H * 0.35);
      } else if (s.status === 'over') {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = spreadFont(30);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Игра окончена', LOGICAL_W / 2, LOGICAL_H * 0.3);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '15px "Segoe UI", system-ui, sans-serif';
        ctx.fillText('Пробел или клик — попробовать снова', LOGICAL_W / 2, LOGICAL_H * 0.3 + 42);
      }
      ctx.restore();
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min(time - lastTime, 33));
      lastTime = time;
      runRef.current.frameBlink += 1;
      stepPhysics(dt);
      draw();
    };
    raf = requestAnimationFrame(loop);

    const isTypingTarget = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
        e.preventDefault();
        jump();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        const s = runRef.current;
        if (!s.grounded) s.vy = Math.max(s.vy, 7);
        s.holdDuck = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') runRef.current.holdDuck = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      bundle.sprite = null;
      bundle.spriteReady = false;
    };
  }, [mode, config, jump]);

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    jump();
  };

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let fired = false;
    let duckHeld = false;

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.touches.length !== 1 || target?.tagName === 'SELECT') {
        tracking = false;
        return;
      }
      tracking = true;
      fired = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || fired || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) < 10 || Math.abs(dy) <= Math.abs(dx)) return;
      if (runRef.current.status === 'running') e.preventDefault();
      if (Math.abs(dy) < 28) return;
      fired = true;
      if (dy < 0) {
        jump();
      } else {
        const s = runRef.current;
        if (s.status === 'running') {
          if (!s.grounded) s.vy = Math.max(s.vy, 7);
          s.holdDuck = true;
          duckHeld = true;
        }
      }
    };

    const onTouchEnd = () => {
      tracking = false;
      if (duckHeld) {
        runRef.current.holdDuck = false;
        duckHeld = false;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      if (duckHeld) runRef.current.holdDuck = false;
    };
  }, [jump]);

  const entries = shownBoard?.entries ?? [];

  return (
    <div ref={pageRef} className="space-y-4">
      <div>
        <Link to="/games" className="text-sm text-dark-textMuted hover:text-primary-400">← Игры</Link>
        <h1 className="text-2xl font-bold text-dark-text mt-1">{config.title}</h1>
        <p className="text-dark-textMuted text-sm">{config.subtitle}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 p-3 border-b border-dark-border">
          <div>
            <label htmlFor="escape-mode" className="block text-xs text-dark-textMuted mb-1">Преподаватель</label>
            <select
              id="escape-mode"
              className="input text-sm"
              value={mode}
              onChange={(e) => {
                e.currentTarget.blur();
                setMode(e.target.value as GameModeId);
              }}
            >
              {escapeModes.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-dark-textMuted">Личный рекорд:</span>
            <span className="font-mono font-semibold text-dark-text">
              {shownBoard?.currentUserBest != null ? formatScore(shownBoard.currentUserBest) : '—'}
            </span>
          </div>
        </div>

        <div className="p-3">
          <div className="hidden portrait:flex md:hidden items-center gap-2 rounded-xl border border-primary-500/30 bg-primary-500/10 px-3 py-2 mb-3 text-xs text-primary-300">
            <span className="text-base">📱↻</span>
            <span>Поверните телефон горизонтально — окно игры станет заметно больше</span>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            className="w-full block rounded-xl bg-dark-bg border border-dark-border cursor-pointer touch-none select-none"
            style={{ aspectRatio: `${LOGICAL_W} / ${LOGICAL_H}` }}
            aria-label={`Игра ${config.title}`}
          />
          <p className="text-xs text-dark-textMuted mt-2">
            {config.description}. На телефоне: свайп вверх — прыжок, свайп вниз — присесть.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Рейтинг: {config.title}</CardTitle>
          <CardDescription>Топ-20 беглецов по личным рекордам</CardDescription>
        </CardHeader>
        <CardContent>
          {isBoardLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-10" />)}</div>
          ) : entries.length === 0 ? (
            <p className="text-dark-textMuted text-sm py-4 text-center">
              {boardFailed ? 'Не удалось загрузить рейтинг' : 'Пока никто не убежал. Стань первым — прыгай!'}
            </p>
          ) : (
            <ol className="space-y-1">
              {entries.map((e) => (
                <li
                  key={e.userId}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${
                    e.isCurrentUser ? 'bg-primary-500/15 text-primary-300 border border-primary-500/30' : 'text-dark-text'
                  }`}
                >
                  <span className="w-8 text-center font-semibold text-dark-textMuted">
                    {medalFor(e.rank) ?? e.rank}
                  </span>
                  <span className="flex-1 truncate">{e.displayName}</span>
                  <span className="font-mono font-semibold">{formatScore(e.score)}</span>
                </li>
              ))}
            </ol>
          )}
          {shownBoard?.currentUserRank != null && !entries.some((e) => e.isCurrentUser) && (
            <p className="text-xs text-dark-textMuted mt-3 px-3">
              Ваше место: {shownBoard.currentUserRank}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EscapeGamePage;
