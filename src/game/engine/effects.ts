// Battle visual effects — floating damage numbers, HP drain, screen shake
// Used by the legacy battle system. Dungeon runner has its own effects.

import { Color, Font, Timing } from '../theme.js';

// ── Floating text ────────────────────────────────────────────────────────

interface FloatingText {
  text: string;
  x: number;
  y: number;
  color: string;
  elapsed: number;
  duration: number;
  glow?: string;
}

const floatingTexts: FloatingText[] = [];

export function spawnDamageNumber(
  damage: number,
  x: number,
  y: number,
  options?: { critical?: boolean; effectiveness?: number }
): void {
  const critical = options?.critical ?? false;
  const eff = options?.effectiveness ?? 1.0;

  let color: string = Color.textPrimary;
  let glowColor: string | undefined;

  if (critical) {
    color = Color.hpMid;
    glowColor = Color.hpMid;
  }
  if (eff > 1.0) {
    color = Color.accentRose;
    glowColor = Color.accentRose;
  } else if (eff < 1.0) {
    color = Color.textSecondary;
  }

  floatingTexts.push({
    text: `${damage}`,
    x, y, color,
    elapsed: 0,
    duration: Timing.lootFloat,
    glow: glowColor,
  });
}

export function spawnFloatingLabel(
  text: string,
  x: number,
  y: number,
  color?: string
): void {
  floatingTexts.push({
    text, x, y,
    color: color ?? Color.accentCyan,
    elapsed: 0,
    duration: Timing.lootFloat + 200,
  });
}

// ── Screen shake ─────────────────────────────────────────────────────────

interface ShakeState {
  intensity: number;
  elapsed: number;
  duration: number;
}

let shake: ShakeState | null = null;

export function triggerShake(intensity?: number, duration?: number): void {
  shake = {
    intensity: intensity ?? 4,
    elapsed: 0,
    duration: duration ?? 200,
  };
}

export function getShakeOffset(): { x: number; y: number } {
  if (!shake) return { x: 0, y: 0 };
  const progress = shake.elapsed / shake.duration;
  const decay = 1 - progress;
  const ox = Math.round(Math.sin(shake.elapsed * 0.3) * shake.intensity * decay);
  const oy = Math.round(Math.cos(shake.elapsed * 0.39) * shake.intensity * decay * 0.6);
  return { x: ox, y: oy };
}

// ── HP bar animation ─────────────────────────────────────────────────────

interface HPAnim {
  target: 'player' | 'enemy';
  from: number;
  to: number;
  elapsed: number;
  duration: number;
}

const hpAnims: HPAnim[] = [];

export function animateHP(target: 'player' | 'enemy', fromHP: number, toHP: number): void {
  const idx = hpAnims.findIndex((a) => a.target === target);
  if (idx >= 0) hpAnims.splice(idx, 1);
  hpAnims.push({ target, from: fromHP, to: toHP, elapsed: 0, duration: Timing.smooth });
}

export function getDisplayHP(target: 'player' | 'enemy', actualHP: number): number {
  const anim = hpAnims.find((a) => a.target === target);
  if (!anim) return actualHP;
  const t = Math.min(1, anim.elapsed / anim.duration);
  const ease = 1 - Math.pow(1 - t, 3);
  return anim.from + (anim.to - anim.from) * ease;
}

// ── Sprite flash ─────────────────────────────────────────────────────────

interface SpriteFlash {
  target: 'player' | 'enemy';
  elapsed: number;
  duration: number;
}

let spriteFlash: SpriteFlash | null = null;

export function triggerSpriteFlash(target: 'player' | 'enemy'): void {
  spriteFlash = { target, elapsed: 0, duration: Timing.medium };
}

export function getSpriteAlpha(target: 'player' | 'enemy'): number {
  if (!spriteFlash || spriteFlash.target !== target) return 1;
  const phase = (spriteFlash.elapsed / spriteFlash.duration) * 6;
  return Math.sin(phase * Math.PI) > 0 ? 0.3 : 1;
}

// ── Idle encounter feed ──────────────────────────────────────────────────

interface IdleFeedEntry {
  text: string;
  elapsed: number;
}

const idleFeed: IdleFeedEntry[] = [];

export function pushIdleFeed(text: string): void {
  idleFeed.unshift({ text, elapsed: 0 });
  if (idleFeed.length > 4) idleFeed.pop();
}

// ── Update all effects ───────────────────────────────────────────────────

export function updateEffects(dt: number): void {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    floatingTexts[i].elapsed += dt;
    if (floatingTexts[i].elapsed >= floatingTexts[i].duration) floatingTexts.splice(i, 1);
  }
  if (shake) {
    shake.elapsed += dt;
    if (shake.elapsed >= shake.duration) shake = null;
  }
  for (let i = hpAnims.length - 1; i >= 0; i--) {
    hpAnims[i].elapsed += dt;
    if (hpAnims[i].elapsed >= hpAnims[i].duration) hpAnims.splice(i, 1);
  }
  if (spriteFlash) {
    spriteFlash.elapsed += dt;
    if (spriteFlash.elapsed >= spriteFlash.duration) spriteFlash = null;
  }
  for (let i = idleFeed.length - 1; i >= 0; i--) {
    idleFeed[i].elapsed += dt;
    if (idleFeed[i].elapsed >= Timing.particleFade) idleFeed.splice(i, 1);
  }
}

// ── Draw ─────────────────────────────────────────────────────────────────

export function drawFloatingTexts(ctx: CanvasRenderingContext2D): void {
  for (const ft of floatingTexts) {
    const t = ft.elapsed / ft.duration;
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const yOff = t * -30;
    ctx.globalAlpha = alpha;
    ctx.font = Font.bodyBold;
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y + yOff);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}

export function drawIdleFeed(ctx: CanvasRenderingContext2D): void {
  if (idleFeed.length === 0) return;
  ctx.font = Font.label;
  for (let i = 0; i < idleFeed.length; i++) {
    const entry = idleFeed[i];
    const t = entry.elapsed / Timing.particleFade;
    const alpha = t < 0.7 ? 0.7 : 0.7 * (1 - (t - 0.7) / 0.3);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = Color.textSecondary;
    ctx.fillText(entry.text, 6, 310 - i * 16);
  }
  ctx.globalAlpha = 1;
}

export function clearBattleEffects(): void {
  floatingTexts.length = 0;
  shake = null;
  hpAnims.length = 0;
  spriteFlash = null;
}
