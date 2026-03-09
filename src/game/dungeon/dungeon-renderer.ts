// Beautiful side-scrolling dungeon renderer
// Parallax backgrounds, ambient particles, glassmorphic HUD, gold accents

import { Color, Font, Dungeon, CANVAS_W, CANVAS_H, glow, clearGlow, glassPanel, hpColor } from '../theme.js';
import { generateMonster } from '../sprites/monster-gen.js';
import type { RunnerState } from './runner.js';
import { getLoot } from './loot.js';

// ── Particles ────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  life: number;
  maxLife: number;
}

const particles: Particle[] = [];
const MAX_PARTICLES = 60;

function spawnAmbient(): void {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push({
    x: Math.random() * CANVAS_W,
    y: CANVAS_H + 5,
    vx: (Math.random() - 0.5) * 8,
    vy: -(Math.random() * 15 + 5),
    size: Math.random() * 1.5 + 0.5,
    alpha: Math.random() * 0.3 + 0.1,
    color: Math.random() > 0.7 ? Color.accentCyan : 'rgba(255,255,255,0.8)',
    life: 0,
    maxLife: 3000 + Math.random() * 4000,
  });
}

function spawnGoldBurst(screenX: number, screenY: number): void {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: screenX,
      y: screenY,
      vx: (Math.random() - 0.5) * 40,
      vy: -(Math.random() * 30 + 10),
      size: Math.random() * 2 + 1,
      alpha: 0.9,
      color: Color.goldBright,
      life: 0,
      maxLife: 800 + Math.random() * 400,
    });
  }
}

function updateParticles(dt: number): void {
  // Spawn ambient particles
  if (Math.random() < dt * 0.003) spawnAmbient();

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    p.x += (p.vx * dt) / 1000;
    p.y += (p.vy * dt) / 1000;
    p.alpha *= 1 - dt * 0.0005;
    if (p.life >= p.maxLife || p.alpha < 0.01) {
      particles.splice(i, 1);
    }
  }
}

// ── Stars (background layer) ─────────────────────────────────────────────

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkleSpeed: number;
}

let stars: Star[] = [];

function initStars(): void {
  if (stars.length > 0) return;
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * CANVAS_W * 3,
      y: Math.random() * (Dungeon.floorY - 30),
      size: Math.random() < 0.2 ? 2 : 1,
      brightness: Math.random() * 0.4 + 0.1,
      twinkleSpeed: Math.random() * 2 + 0.5,
    });
  }
}

// ── Main draw ────────────────────────────────────────────────────────────

let elapsed = 0;

export function drawDungeon(ctx: CanvasRenderingContext2D, state: RunnerState, dt: number): void {
  elapsed += dt;
  updateParticles(dt);
  initStars();

  const cameraX = state.distance - Dungeon.playerScreenX;
  const t = elapsed / 1000;

  // ── Background gradient ──
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, Color.bgDeep);
  grad.addColorStop(0.65, Color.bgPrimary);
  grad.addColorStop(1, Color.bgSurface);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Stars (parallax 0.05) ──
  const starOffset = cameraX * 0.05;
  for (const star of stars) {
    const sx = ((star.x - starOffset) % (CANVAS_W * 3) + CANVAS_W * 3) % (CANVAS_W * 3) - CANVAS_W;
    if (sx < -5 || sx > CANVAS_W + 5) continue;
    const twinkle = Math.sin(t * star.twinkleSpeed + star.x) * 0.1;
    ctx.fillStyle = `rgba(255,255,255,${(star.brightness + twinkle).toFixed(2)})`;
    ctx.fillRect(sx, star.y, star.size, star.size);
  }

  // ── Distant architecture (parallax 0.15) ──
  const archOffset = cameraX * 0.15;
  drawDistantArch(ctx, archOffset, t);

  // ── Floor glow edge ──
  const floorY = Dungeon.floorY;
  glow(ctx, Color.floorEdge, 12);
  ctx.strokeStyle = Color.accentCyan;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(CANVAS_W, floorY);
  ctx.stroke();
  ctx.globalAlpha = 1;
  clearGlow(ctx);

  // ── Floor surface ──
  ctx.fillStyle = Color.bgFloor;
  ctx.fillRect(0, floorY, CANVAS_W, CANVAS_H - floorY);

  // ── Floor grid lines (parallax 1.0) ──
  ctx.strokeStyle = Color.floorGrid;
  ctx.lineWidth = 1;
  for (let gx = -cameraX % 40; gx < CANVAS_W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, floorY);
    ctx.lineTo(gx, CANVAS_H);
    ctx.stroke();
  }

  // ── Room contents (enemies, treasure, boss) ──
  for (const room of state.floor.rooms) {
    const roomScreenX = room.startX + room.width / 2 - cameraX;
    if (roomScreenX < -100 || roomScreenX > CANVAS_W + 100) continue;

    if (room.kind === 'enemy' && !room.cleared && room.enemy) {
      drawEnemy(ctx, roomScreenX, floorY, room.enemy, 1);
    }
    if (room.kind === 'treasure' && !room.cleared) {
      drawChest(ctx, roomScreenX, floorY, t);
    }
    if (room.kind === 'boss' && !room.cleared && room.enemy) {
      drawBossGate(ctx, roomScreenX, floorY, room.enemy, t);
    }
    if (room.kind === 'exit' && !room.cleared) {
      drawExitPortal(ctx, roomScreenX, floorY, t);
    }
  }

  // ── Current encounter enemy (during fight) ──
  if (state.phase === 'encounter' && state.encounterEnemy) {
    const enemyScreenX = state.distance + 80 - cameraX;
    const fadeOut = Math.min(1, Math.max(0, 1 - (state.encounterTimer - 400) / 200));
    drawEnemy(ctx, enemyScreenX, floorY, state.encounterEnemy, fadeOut);
  }

  // ── Boss enemy (during boss fight) ──
  if (state.phase === 'boss' && state.encounterEnemy) {
    const bossScreenX = state.distance + 120 - cameraX;
    drawBossEntity(ctx, bossScreenX, floorY, state.encounterEnemy, state.encounterEnemyHP, t);
  }

  // ── Player character ──
  drawPlayer(ctx, Dungeon.playerScreenX, floorY, state, t);

  // ── Floating texts ──
  for (const ft of state.floatingTexts) {
    const screenX = ft.x - cameraX;
    const progress = ft.elapsed / 1000;
    const alpha = Math.max(0, 1 - progress);
    const yOff = progress * -35;
    ctx.globalAlpha = alpha;
    ctx.font = Font.bodyBold;
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, screenX, ft.y + yOff);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';

  // ── Particles ──
  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── HUD ──
  drawHUD(ctx, state, t);

  // ── Boss fight UI ──
  if (state.phase === 'boss') {
    drawBossUI(ctx, state);
  }

  // ── Floor transition overlay ──
  if (state.phase === 'floor_clear') {
    const p = state.floorTimer / 1200;
    if (p < 0.5) {
      ctx.fillStyle = `rgba(5,5,16,${(p * 2).toFixed(2)})`;
    } else {
      ctx.fillStyle = `rgba(5,5,16,${(2 - p * 2).toFixed(2)})`;
    }
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.font = Font.heading;
    ctx.fillStyle = Color.gold;
    ctx.textAlign = 'center';
    ctx.globalAlpha = p < 0.5 ? p * 2 : 2 - p * 2;
    ctx.fillText(`Floor ${state.floorNum + 1}`, CANVAS_W / 2, CANVAS_H / 2);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // ── Run over screen ──
  if (state.phase === 'run_over') {
    drawRunOver(ctx, state);
  }

  // Trigger gold burst on treasure collection
  if (state.phase === 'collecting' && state.collectTimer < 50) {
    spawnGoldBurst(Dungeon.playerScreenX + 30, Dungeon.floorY - 30);
  }
}

// ── Sub-renderers ────────────────────────────────────────────────────────

function drawDistantArch(ctx: CanvasRenderingContext2D, offset: number, _t: number): void {
  ctx.strokeStyle = 'rgba(6,182,212,0.04)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const x = ((i * 200 - offset) % 1600 + 1600) % 1600 - 200;
    if (x < -100 || x > CANVAS_W + 100) continue;
    // Simple arch shape
    ctx.beginPath();
    ctx.moveTo(x, Dungeon.floorY);
    ctx.lineTo(x, 80);
    ctx.arcTo(x, 40, x + 40, 40, 30);
    ctx.lineTo(x + 60, 40);
    ctx.arcTo(x + 100, 40, x + 100, 80, 30);
    ctx.lineTo(x + 100, Dungeon.floorY);
    ctx.stroke();
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  floorY: number,
  state: RunnerState,
  t: number
): void {
  const bobY = state.phase === 'running' ? Math.sin(t * 6) * 2 : 0;
  const sz = Dungeon.spriteSize;
  const baseY = floorY - sz - 2 + bobY;

  // Glow underneath
  ctx.globalAlpha = 0.15;
  glow(ctx, Color.accentCyan, 15);
  ctx.fillStyle = Color.accentCyan;
  ctx.fillRect(screenX - 2, floorY - 2, sz + 4, 4);
  clearGlow(ctx);
  ctx.globalAlpha = 1;

  // Draw dev character
  drawDevCharacter(ctx, screenX, baseY, sz, t, state.phase === 'running');

  // Damage flash
  if (state.phase === 'encounter' && state.encounterTimer > 400 && state.encounterTimer < 600) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = Color.hpLow;
    ctx.fillRect(screenX, baseY, sz, sz);
    ctx.globalAlpha = 1;
  }
}

function drawDevCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  t: number,
  running: boolean
): void {
  const s = size / 48; // scale factor (designed at 48px)
  const cx = x + size / 2;

  // ── Legs ──
  const legSwing = running ? Math.sin(t * 10) * 3 * s : 0;
  ctx.fillStyle = '#1E293B'; // dark pants
  ctx.fillRect(cx - 7 * s + legSwing, y + 34 * s, 5 * s, 12 * s);
  ctx.fillRect(cx + 2 * s - legSwing, y + 34 * s, 5 * s, 12 * s);
  // Shoes
  ctx.fillStyle = '#334155';
  ctx.fillRect(cx - 8 * s + legSwing, y + 44 * s, 7 * s, 3 * s);
  ctx.fillRect(cx + 1 * s - legSwing, y + 44 * s, 7 * s, 3 * s);

  // ── Body (hoodie) ──
  ctx.fillStyle = '#1E3A5F'; // dark blue hoodie
  ctx.fillRect(cx - 10 * s, y + 16 * s, 20 * s, 20 * s);
  // Hoodie highlight stripe
  ctx.fillStyle = '#2563EB';
  ctx.fillRect(cx - 10 * s, y + 16 * s, 2 * s, 20 * s);

  // ── Arms ──
  const armSwing = running ? Math.sin(t * 10 + Math.PI) * 4 * s : 0;
  ctx.fillStyle = '#1E3A5F';
  ctx.fillRect(cx - 14 * s, y + 18 * s + armSwing, 5 * s, 14 * s);
  ctx.fillRect(cx + 9 * s, y + 18 * s - armSwing, 5 * s, 14 * s);
  // Hands
  ctx.fillStyle = '#FCD9B6'; // skin tone
  ctx.fillRect(cx - 14 * s, y + 30 * s + armSwing, 5 * s, 3 * s);
  ctx.fillRect(cx + 9 * s, y + 30 * s - armSwing, 5 * s, 3 * s);

  // ── Head ──
  ctx.fillStyle = '#FCD9B6';
  ctx.fillRect(cx - 7 * s, y + 4 * s, 14 * s, 13 * s);

  // ── Hair ──
  ctx.fillStyle = '#1C1917'; // dark hair
  ctx.fillRect(cx - 8 * s, y + 2 * s, 16 * s, 6 * s);
  ctx.fillRect(cx - 8 * s, y + 4 * s, 3 * s, 4 * s); // side hair

  // ── Eyes (pixel style) ──
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(cx - 4 * s, y + 9 * s, 3 * s, 3 * s);
  ctx.fillRect(cx + 1 * s, y + 9 * s, 3 * s, 3 * s);
  ctx.fillStyle = '#06B6D4'; // cyan irises
  ctx.fillRect(cx - 3 * s, y + 10 * s, 2 * s, 2 * s);
  ctx.fillRect(cx + 2 * s, y + 10 * s, 2 * s, 2 * s);

  // ── Laptop glow (held in front when not running) ──
  if (!running) {
    const laptopGlow = Math.sin(t * 3) * 0.1 + 0.4;
    ctx.globalAlpha = laptopGlow;
    glow(ctx, Color.accentCyan, 8);
    ctx.fillStyle = Color.accentCyan;
    ctx.fillRect(cx - 6 * s, y + 24 * s, 12 * s, 2 * s);
    clearGlow(ctx);
    ctx.globalAlpha = 1;
    // Laptop body
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 7 * s, y + 25 * s, 14 * s, 3 * s);
  }

  // ── Hoodie hood outline ──
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, y + 6 * s, 10 * s, Math.PI * 0.8, Math.PI * 0.2);
  ctx.stroke();
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  floorY: number,
  enemy: { id: number; color: string },
  alpha: number
): void {
  ctx.globalAlpha = alpha;
  const sprite = generateMonster(enemy.id, enemy.color, 40);
  ctx.drawImage(sprite, screenX - 20, floorY - 42);
  ctx.globalAlpha = 1;
}

function drawChest(ctx: CanvasRenderingContext2D, screenX: number, floorY: number, t: number): void {
  const sparkle = Math.sin(t * 4) * 0.2 + 0.8;
  // Chest body
  ctx.fillStyle = Color.goldDim;
  ctx.fillRect(screenX - 12, floorY - 20, 24, 16);
  // Lid
  ctx.fillStyle = Color.gold;
  ctx.fillRect(screenX - 14, floorY - 24, 28, 6);
  // Sparkle
  ctx.globalAlpha = sparkle * 0.6;
  glow(ctx, Color.goldGlow, 8);
  ctx.fillStyle = Color.goldBright;
  ctx.fillRect(screenX - 1, floorY - 28, 2, 2);
  clearGlow(ctx);
  ctx.globalAlpha = 1;
}

function drawBossGate(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  floorY: number,
  enemy: { name: string; color: string },
  t: number
): void {
  const pulse = Math.sin(t * 2) * 0.15 + 0.85;
  // Gate pillars
  ctx.fillStyle = 'rgba(244,63,94,0.15)';
  ctx.fillRect(screenX - 40, floorY - 80, 10, 80);
  ctx.fillRect(screenX + 30, floorY - 80, 10, 80);
  // Gate arch
  ctx.strokeStyle = `rgba(244,63,94,${(pulse * 0.4).toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(screenX, floorY - 80, 35, Math.PI, 0);
  ctx.stroke();
  // Boss name
  ctx.font = Font.label;
  ctx.fillStyle = Color.accentRose;
  ctx.textAlign = 'center';
  ctx.globalAlpha = pulse;
  ctx.fillText('BOSS', screenX, floorY - 88);
  ctx.fillText(enemy.name, screenX, floorY - 76);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawBossEntity(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  floorY: number,
  enemy: { id: number; name: string; color: string; hp: number },
  currentHP: number,
  t: number
): void {
  // Boss aura
  const auraR = 30 + Math.sin(t * 3) * 5;
  ctx.globalAlpha = 0.08;
  glow(ctx, enemy.color, 20);
  ctx.fillStyle = enemy.color;
  ctx.beginPath();
  ctx.arc(screenX, floorY - 35, auraR, 0, Math.PI * 2);
  ctx.fill();
  clearGlow(ctx);
  ctx.globalAlpha = 1;

  // Boss sprite (larger)
  const sprite = generateMonster(enemy.id, enemy.color, 56);
  ctx.drawImage(sprite, screenX - 28, floorY - 60);

  // Boss HP bar
  const barW = 70;
  const barH = 5;
  const barX = screenX - barW / 2;
  const barY = floorY - 68;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(barX, barY, barW, barH);
  const pct = Math.max(0, currentHP / enemy.hp);
  ctx.fillStyle = hpColor(currentHP, enemy.hp);
  ctx.fillRect(barX, barY, barW * pct, barH);
}

function drawExitPortal(ctx: CanvasRenderingContext2D, screenX: number, floorY: number, t: number): void {
  const pulse = Math.sin(t * 2.5) * 0.2 + 0.8;
  ctx.globalAlpha = pulse * 0.3;
  glow(ctx, Color.accentPurple, 15);
  ctx.fillStyle = Color.accentPurple;
  ctx.beginPath();
  ctx.arc(screenX, floorY - 25, 18, 0, Math.PI * 2);
  ctx.fill();
  clearGlow(ctx);
  ctx.globalAlpha = 1;
  ctx.font = Font.label;
  ctx.fillStyle = Color.accentPurple;
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', screenX, floorY - 50);
  ctx.textAlign = 'left';
}

// ── HUD (glassmorphic) ───────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, state: RunnerState, _t: number): void {
  // Top-left: Floor + progress
  glassPanel(ctx, 6, 6, 100, 32);
  ctx.font = Font.labelBold;
  ctx.fillStyle = Color.textSecondary;
  ctx.fillText('FLOOR', 14, 19);
  ctx.font = Font.number;
  ctx.fillStyle = Color.textPrimary;
  ctx.fillText(`${state.floorNum}`, 60, 30);

  // Floor progress bar
  const progW = 88;
  const progPct = Math.min(1, state.distance / state.floor.totalWidth);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(12, 33, progW, 2);
  ctx.fillStyle = Color.accentCyan;
  ctx.fillRect(12, 33, progW * progPct, 2);

  // Top-right: Gold
  glassPanel(ctx, CANVAS_W - 100, 6, 94, 32);
  ctx.font = Font.labelBold;
  ctx.fillStyle = Color.goldDim;
  ctx.fillText('GOLD', CANVAS_W - 92, 19);
  ctx.font = Font.number;
  ctx.fillStyle = Color.gold;
  ctx.textAlign = 'right';
  ctx.fillText(`${getLoot().gold}`, CANVAS_W - 14, 30);
  ctx.textAlign = 'left';

  // HP bar (top center)
  const hpBarW = 140;
  const hpBarX = (CANVAS_W - hpBarW) / 2;
  glassPanel(ctx, hpBarX - 8, 6, hpBarW + 16, 28);
  ctx.font = Font.label;
  ctx.fillStyle = Color.textSecondary;
  ctx.fillText('HP', hpBarX, 18);
  // Bar background
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(hpBarX + 18, 13, hpBarW - 18, 8);
  // Bar fill
  const hpPct = Math.max(0, state.playerHP / state.playerMaxHP);
  ctx.fillStyle = hpColor(state.playerHP, state.playerMaxHP);
  ctx.fillRect(hpBarX + 18, 13, (hpBarW - 18) * hpPct, 8);
  // HP text
  ctx.font = Font.label;
  ctx.fillStyle = Color.textPrimary;
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.max(0, Math.ceil(state.playerHP))}/${state.playerMaxHP}`, hpBarX + hpBarW, 30);
  ctx.textAlign = 'left';

  // Bottom-left: Event log
  if (state.eventLog.length > 0) {
    const logH = Math.min(state.eventLog.length, 3) * 16 + 8;
    glassPanel(ctx, 6, CANVAS_H - logH - 6, 250, logH);
    ctx.font = Font.label;
    for (let i = 0; i < Math.min(state.eventLog.length, 3); i++) {
      const entry = state.eventLog[i];
      const alpha = Math.max(0, 1 - entry.elapsed / 4000);
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = Color.textSecondary;
      ctx.fillText(entry.text, 14, CANVAS_H - logH + 4 + i * 16);
    }
    ctx.globalAlpha = 1;
  }

  // Bottom-right: Run stats
  glassPanel(ctx, CANVAS_W - 110, CANVAS_H - 28, 104, 22);
  ctx.font = Font.label;
  ctx.fillStyle = Color.textMuted;
  ctx.fillText(`Defeated: ${state.defeated}  Loot: ${state.treasures}`, CANVAS_W - 104, CANVAS_H - 14);
}

// ── Boss fight UI ────────────────────────────────────────────────────────

function drawBossUI(ctx: CanvasRenderingContext2D, state: RunnerState): void {
  // Darken background slightly
  ctx.fillStyle = 'rgba(5,5,16,0.4)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Menu panel
  const panelW = 200;
  const panelH = 90;
  const panelX = (CANVAS_W - panelW) / 2;
  const panelY = CANVAS_H - panelH - 20;
  glassPanel(ctx, panelX, panelY, panelW, panelH);

  const options = ['FIGHT', 'POWER ATK (15g)', 'FLEE'];
  ctx.font = Font.body;
  options.forEach((opt, i) => {
    const y = panelY + 22 + i * 24;
    const selected = i === state.bossMenuIdx;
    if (selected) {
      ctx.fillStyle = Color.glassHighlight;
      ctx.fillRect(panelX + 4, y - 14, panelW - 8, 20);
    }
    ctx.fillStyle = selected ? Color.gold : Color.textSecondary;
    ctx.fillText(selected ? `▸ ${opt}` : `  ${opt}`, panelX + 12, y);
  });

  // Boss message
  if (state.bossMessage) {
    glassPanel(ctx, 40, panelY - 36, CANVAS_W - 80, 28);
    ctx.font = Font.small;
    ctx.fillStyle = Color.textPrimary;
    ctx.textAlign = 'center';
    ctx.fillText(state.bossMessage, CANVAS_W / 2, panelY - 18);
    ctx.textAlign = 'left';
  }

  // Hint
  ctx.font = Font.label;
  ctx.fillStyle = Color.textDisabled;
  ctx.textAlign = 'center';
  ctx.fillText('[↑↓] Select   [ENTER] Confirm', CANVAS_W / 2, CANVAS_H - 8);
  ctx.textAlign = 'left';
}

// ── Run Over screen ──────────────────────────────────────────────────────

function drawRunOver(ctx: CanvasRenderingContext2D, state: RunnerState): void {
  ctx.fillStyle = 'rgba(5,5,16,0.85)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const cx = CANVAS_W / 2;

  ctx.textAlign = 'center';
  glow(ctx, Color.accentRose, 12);
  ctx.font = Font.title;
  ctx.fillStyle = Color.accentRose;
  ctx.fillText('RUN COMPLETE', cx, 60);
  clearGlow(ctx);

  // Stats
  glassPanel(ctx, cx - 120, 80, 240, 140);
  ctx.font = Font.body;
  ctx.fillStyle = Color.textSecondary;
  const stats = [
    ['Floor Reached', `${state.floorNum}`],
    ['Enemies Defeated', `${state.defeated}`],
    ['Treasures Found', `${state.treasures}`],
    ['Gold Earned', `${state.gold}`],
    ['Total Gold', `${getLoot().gold}`],
  ];
  stats.forEach(([label, value], i) => {
    const y = 104 + i * 24;
    ctx.textAlign = 'left';
    ctx.fillStyle = Color.textSecondary;
    ctx.font = Font.small;
    ctx.fillText(label, cx - 105, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = Color.gold;
    ctx.font = Font.bodyBold;
    ctx.fillText(value, cx + 105, y);
  });

  // Prompt
  ctx.textAlign = 'center';
  ctx.font = Font.small;
  ctx.fillStyle = Color.textDisabled;
  if (Math.sin(elapsed / 500) > 0) {
    ctx.fillText('[ENTER] Start New Run', cx, 260);
  }
  ctx.textAlign = 'left';
}
