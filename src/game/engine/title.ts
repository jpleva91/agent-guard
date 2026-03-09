// Title screen — premium dark aesthetic with gold accents

import { wasPressed } from './input.js';
import { hasSave } from '../sync/save.js';
import { playMenuNav, playMenuConfirm } from '../audio/sound.js';
import { Color, Font, CANVAS_W, CANVAS_H, glow, clearGlow, glassPanel } from '../theme.js';
import { getLoot } from '../dungeon/loot.js';

let menuIndex = 0;
let elapsed = 0;
let initialized = false;

function initTitle(): void {
  if (initialized) return;
  initialized = true;
  menuIndex = 0;
  elapsed = 0;
}

export type TitleResult = 'continue' | 'new' | 'grimoire' | null;

export function updateTitle(dt: number): TitleResult {
  initTitle();
  elapsed += dt;

  const options = getOptions();

  if (wasPressed('ArrowUp')) {
    menuIndex = Math.max(0, menuIndex - 1);
    playMenuNav();
  }
  if (wasPressed('ArrowDown')) {
    menuIndex = Math.min(options.length - 1, menuIndex + 1);
    playMenuNav();
  }

  if (wasPressed('Enter') || wasPressed(' ')) {
    playMenuConfirm();
    initialized = false;
    const selected = options[menuIndex];
    if (selected === 'CONTINUE RUN') return 'continue';
    if (selected === 'START RUN') return 'new';
    if (selected === 'GRIMOIRE') return 'grimoire';
  }
  return null;
}

function getOptions(): string[] {
  const opts: string[] = [];
  if (hasSave()) opts.push('CONTINUE RUN');
  opts.push('START RUN');
  opts.push('GRIMOIRE');
  return opts;
}

export function drawTitle(ctx: CanvasRenderingContext2D): void {
  const t = elapsed / 1000;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, Color.bgDeep);
  grad.addColorStop(1, Color.bgPrimary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Stars
  for (let i = 0; i < 50; i++) {
    const h = (i * 9301 + 49297) % 233280;
    const x = h % CANVAS_W;
    const y = (h * 7 + i * 131) % CANVAS_H;
    const bright = 0.15 + (((i * 7919) % 100) / 100) * 0.35;
    const twinkle = Math.sin(t * 1.5 + i * 0.7) * 0.1;
    ctx.fillStyle = `rgba(255,255,255,${(bright + twinkle).toFixed(2)})`;
    ctx.fillRect(x, y, ((i * 1301) % 3) === 0 ? 2 : 1, 1);
  }

  // Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = Font.title;
  glow(ctx, Color.goldGlow, 20);
  ctx.fillStyle = Color.gold;
  ctx.fillText('BUGMON', CANVAS_W / 2, 55);
  clearGlow(ctx);

  // Subtitle
  ctx.font = Font.small;
  ctx.fillStyle = Color.textSecondary;
  ctx.fillText('Idle Dungeon Runner', CANVAS_W / 2, 80);

  // Tagline
  const tagAlpha = 0.35 + Math.sin(t * 2) * 0.1;
  ctx.font = Font.label;
  ctx.fillStyle = `rgba(6,182,212,${tagAlpha.toFixed(2)})`;
  ctx.fillText("// Gotta Cache 'Em All", CANVAS_W / 2, 98);

  // Stats panel (if player has history)
  const loot = getLoot();
  if (loot.totalRuns > 0) {
    glassPanel(ctx, CANVAS_W / 2 - 90, 110, 180, 24);
    ctx.font = Font.label;
    ctx.fillStyle = Color.textMuted;
    ctx.fillText(
      `Runs: ${loot.totalRuns}  |  High: F${loot.highFloor}  |  Gold: ${loot.gold}`,
      CANVAS_W / 2,
      126
    );
  }

  // Menu
  const options = getOptions();
  const menuStartY = loot.totalRuns > 0 ? 150 : 130;

  options.forEach((opt, i) => {
    const y = menuStartY + i * 30;
    const sel = i === menuIndex;

    if (sel) {
      glassPanel(ctx, CANVAS_W / 2 - 80, y - 12, 160, 24);
      ctx.fillStyle = Color.glassHighlight;
      ctx.fillRect(CANVAS_W / 2 - 78, y - 10, 156, 20);
    }

    ctx.font = sel ? Font.bodyBold : Font.body;
    ctx.fillStyle = sel ? Color.gold : Color.textSecondary;
    ctx.fillText(opt, CANVAS_W / 2, y + 3);
  });

  // Prompt
  if (Math.sin(t * 2.5) > 0) {
    ctx.font = Font.label;
    ctx.fillStyle = Color.textDisabled;
    ctx.fillText('[ENTER] to select', CANVAS_W / 2, CANVAS_H - 30);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
