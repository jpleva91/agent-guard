// Evolution animation

import { playEvolution } from '../audio/sound.js';
import { drawSprite } from '../sprites/sprites.js';
import { Color, Font, glow, clearGlow } from '../theme.js';

interface MonLike {
  name: string;
  color?: string;
  sprite?: string;
}

interface EvoAnim {
  fromMon: MonLike;
  toMon: MonLike;
  timer: number;
  done: boolean;
}

let evoAnim: EvoAnim | null = null;
const EVO_PHASES = [2000, 3000, 1500, 2000]; // announce, flash, reveal, complete
const TOTAL = EVO_PHASES.reduce((a, b) => a + b, 0);

export function startEvolutionAnimation(fromMon: MonLike, toMon: MonLike): EvoAnim {
  evoAnim = { fromMon, toMon, timer: 0, done: false };
  playEvolution();
  return evoAnim;
}

export function updateEvolutionAnimation(dt: number): boolean {
  if (!evoAnim || evoAnim.done) return false;
  evoAnim.timer += dt;
  if (evoAnim.timer >= TOTAL) {
    evoAnim.done = true;
    return true;
  }
  return false;
}

export function drawEvolutionAnimation(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (!evoAnim) return;
  ctx.fillStyle = Color.bgDeep;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2 - 20;
  const sz = 96;
  const t = evoAnim.timer;
  const { fromMon, toMon } = evoAnim;

  if (t < EVO_PHASES[0]) {
    drawMon(ctx, fromMon, cx, cy, sz, 1);
    drawText(ctx, `What? ${fromMon.name} is evolving!`, cx, h - 50);
  } else if (t < EVO_PHASES[0] + EVO_PHASES[1]) {
    const p = (t - EVO_PHASES[0]) / EVO_PHASES[1];
    const speed = 4 + p * 20;
    const showNew = Math.sin((t - EVO_PHASES[0]) * 0.01 * speed) > 0;
    const mon = showNew ? toMon : fromMon;
    drawMon(ctx, mon, cx, cy, sz * (1 + p * 0.2), 1);
    if (p > 0.8) {
      ctx.fillStyle = `rgba(255,255,255,${((p - 0.8) * 5).toFixed(2)})`;
      ctx.fillRect(0, 0, w, h);
    }
  } else if (t < EVO_PHASES[0] + EVO_PHASES[1] + EVO_PHASES[2]) {
    const p = (t - EVO_PHASES[0] - EVO_PHASES[1]) / EVO_PHASES[2];
    if (p < 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${(1 - p / 0.3).toFixed(2)})`;
      ctx.fillRect(0, 0, w, h);
    }
    drawMon(ctx, toMon, cx, cy, sz * 1.2, Math.min(1, p * 2));
  } else {
    drawMon(ctx, toMon, cx, cy, sz * 1.2, 1);
    drawText(ctx, `${fromMon.name} evolved into ${toMon.name}!`, cx, h - 50);
  }
}

function drawMon(
  ctx: CanvasRenderingContext2D,
  mon: MonLike,
  cx: number,
  cy: number,
  size: number,
  alpha: number
): void {
  ctx.globalAlpha = alpha;
  const x = cx - size / 2;
  const y = cy - size / 2;
  if (!mon.sprite || !drawSprite(ctx, mon.sprite, x, y, size, size)) {
    ctx.fillStyle = mon.color || '#888';
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  glow(ctx, Color.accentCyan, 8);
  ctx.fillStyle = Color.textPrimary;
  ctx.font = Font.body;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  clearGlow(ctx);
  ctx.textAlign = 'left';
}

export function getEvolutionAnimation(): EvoAnim | null {
  return evoAnim;
}

export function clearEvolutionAnimation(): void {
  evoAnim = null;
}
