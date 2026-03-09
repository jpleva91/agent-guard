// Canvas rendering — themed, with battle effects and roguelike HUD

import { drawSprite } from '../sprites/sprites.js';
import { getTileTexture, getGrassFrame, getBattleBackground } from '../sprites/tiles.js';
import { generateMonster, generateEgg } from '../sprites/monster-gen.js';
import {
  Color,
  Font,
  Space,
  TILE,
  CANVAS_W,
  CANVAS_H,
  hpColor,
  glow,
  clearGlow,
  TypeColor,
} from '../theme.js';
import {
  getShakeOffset,
  getDisplayHP,
  getSpriteAlpha,
  drawFloatingTexts,
  drawIdleFeed,
} from './effects.js';

let ctx: CanvasRenderingContext2D | null = null;
let frameCount = 0;

interface MapData {
  width: number;
  height: number;
  tiles: number[][];
}

interface PlayerLike {
  x: number;
  y: number;
  dir: string;
}

interface BattleMon {
  id: number;
  name: string;
  type?: string;
  hp: number;
  currentHP: number;
  color?: string;
  sprite?: string;
  moves: string[];
}

interface BattleView {
  enemy: BattleMon;
  playerMon: BattleMon;
  state: string;
  menuIndex: number;
  moveIndex: number;
  message: string;
}

interface MoveData {
  id: string;
  name: string;
  type?: string;
}

export function initRenderer(canvas: HTMLCanvasElement): void {
  ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
}

// ── Overworld ────────────────────────────────────────────────────────────

export function drawMap(mapData: MapData): void {
  if (!ctx) return;
  frameCount++;
  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const tile = mapData.tiles[y][x];
      let texture: HTMLCanvasElement | null;
      if (tile === 1) {
        texture = getTileTexture('wall');
      } else if (tile === 2) {
        texture = getGrassFrame(frameCount);
      } else {
        texture = getTileTexture('ground');
      }
      if (texture) ctx.drawImage(texture, x * TILE, y * TILE);
    }
  }
}

export function drawPlayer(player: PlayerLike): void {
  if (!ctx) return;
  const px = player.x * TILE;
  const py = player.y * TILE;

  const spriteName = `player_${player.dir}`;
  if (drawSprite(ctx, spriteName, px, py, TILE, TILE)) return;

  ctx.fillStyle = Color.accentCyan;
  ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);

  ctx.fillStyle = Color.gold;
  const cx = px + TILE / 2;
  const cy = py + TILE / 2;
  ctx.beginPath();
  if (player.dir === 'up') {
    ctx.moveTo(cx, py + 2);
    ctx.lineTo(cx - 4, py + 10);
    ctx.lineTo(cx + 4, py + 10);
  } else if (player.dir === 'down') {
    ctx.moveTo(cx, py + TILE - 2);
    ctx.lineTo(cx - 4, py + TILE - 10);
    ctx.lineTo(cx + 4, py + TILE - 10);
  } else if (player.dir === 'left') {
    ctx.moveTo(px + 2, cy);
    ctx.lineTo(px + 10, cy - 4);
    ctx.lineTo(px + 10, cy + 4);
  } else {
    ctx.moveTo(px + TILE - 2, cy);
    ctx.lineTo(px + TILE - 10, cy - 4);
    ctx.lineTo(px + TILE - 10, cy + 4);
  }
  ctx.fill();
}

// ── Run HUD (roguelike framing) ──────────────────────────────────────────

interface RunHUDData {
  monName: string;
  currentHP: number;
  maxHP: number;
  partySize: number;
  runNumber: number;
  evoProgress?: { eventLabel: string; current: number; required: number } | null;
}

export function drawRunHUD(data: RunHUDData): void {
  if (!ctx) return;
  const h = Space.hudHeight;

  // Background bar
  ctx.fillStyle = Color.bgSurface;
  ctx.fillRect(0, 0, CANVAS_W, h);

  // Bottom accent line
  ctx.fillStyle = Color.accentCyan;
  ctx.fillRect(0, h - 1, CANVAS_W, 1);

  ctx.font = Font.small;

  // Run number (left)
  ctx.fillStyle = Color.accentCyan;
  ctx.fillText(`RUN #${data.runNumber}`, 6, h - 8);

  // Mon name + HP (center-left)
  ctx.fillStyle = Color.textPrimary;
  const hpText = `${data.monName} ${Math.ceil(data.currentHP)}/${data.maxHP}`;
  ctx.fillText(hpText, 100, h - 8);

  // Mini HP bar inline
  const barX = 100 + ctx.measureText(hpText).width + 8;
  const barW = 50;
  const barH = 6;
  const barY = h - 14;
  const pct = Math.max(0, data.currentHP / data.maxHP);
  ctx.fillStyle = Color.bgSurface;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = hpColor(data.currentHP, data.maxHP);
  ctx.fillRect(barX, barY, barW * pct, barH);

  // Party count (center-right)
  ctx.fillStyle = Color.textSecondary;
  ctx.fillText(`Party:${data.partySize}`, 330, h - 8);

  // Evolution progress (right)
  if (data.evoProgress) {
    ctx.fillStyle = Color.accentPurple;
    ctx.fillText(
      `${data.evoProgress.eventLabel}:${data.evoProgress.current}/${data.evoProgress.required}`,
      400,
      h - 8
    );
  }
}

// ── Battle ───────────────────────────────────────────────────────────────

export function drawBattle(
  battle: BattleView,
  movesData: MoveData[],
  _typeColors?: Record<string, string>
): void {
  if (!ctx) return;

  // Apply screen shake
  const shk = getShakeOffset();
  ctx.save();
  ctx.translate(shk.x, shk.y);

  // Background
  const bg = getBattleBackground();
  if (bg) {
    ctx.drawImage(bg, 0, 0);
  } else {
    ctx.fillStyle = Color.bgPrimary;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // ── Enemy BugMon (top right) ──
  const enemyAlpha = getSpriteAlpha('enemy');
  ctx.globalAlpha = enemyAlpha;
  if (!battle.enemy.sprite || !drawSprite(ctx, battle.enemy.sprite, 320, 40, 64, 64)) {
    const enemySprite = generateEgg(battle.enemy.id, battle.enemy.color || '#ccc', 64);
    ctx.drawImage(enemySprite, 320, 40);
  }
  ctx.globalAlpha = 1;

  // Enemy name + type indicator
  ctx.font = Font.body;
  ctx.fillStyle = Color.textPrimary;
  ctx.fillText(battle.enemy.name, 300, 30);
  if (battle.enemy.type) {
    const tc = TypeColor[battle.enemy.type] || Color.textSecondary;
    ctx.fillStyle = tc;
    ctx.font = Font.label;
    ctx.fillText(battle.enemy.type.toUpperCase(), 300, 16);
  }

  // Enemy HP bar (animated)
  const enemyDisplayHP = getDisplayHP('enemy', battle.enemy.currentHP);
  drawHPBar(ctx, 300, 110, 120, enemyDisplayHP, battle.enemy.hp);

  // ── Player BugMon (bottom left) ──
  const playerMon = battle.playerMon;
  const playerAlpha = getSpriteAlpha('player');
  ctx.globalAlpha = playerAlpha;
  if (!playerMon.sprite || !drawSprite(ctx, playerMon.sprite, 80, 140, 64, 64)) {
    const playerSprite = generateMonster(playerMon.id, playerMon.color || Color.accentCyan, 64);
    ctx.drawImage(playerSprite, 80, 140);
  }
  ctx.globalAlpha = 1;

  // Player name + type
  ctx.font = Font.body;
  ctx.fillStyle = Color.textPrimary;
  ctx.fillText(playerMon.name, 60, 130);
  if (playerMon.type) {
    const tc = TypeColor[playerMon.type] || Color.textSecondary;
    ctx.fillStyle = tc;
    ctx.font = Font.label;
    ctx.fillText(playerMon.type.toUpperCase(), 60, 218);
  }

  // Player HP bar (animated)
  const playerDisplayHP = getDisplayHP('player', playerMon.currentHP);
  drawHPBar(ctx, 60, 206, 120, playerDisplayHP, playerMon.hp);

  // ── Floating damage numbers ──
  drawFloatingTexts(ctx);

  // ── Menu area ──
  ctx.fillStyle = Color.bgSurface;
  ctx.fillRect(0, 240, CANVAS_W, Space.menuHeight);
  ctx.strokeStyle = Color.glassBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 240, CANVAS_W, Space.menuHeight);

  if (battle.state === 'menu') {
    drawBattleMenu(ctx, battle.menuIndex);
  } else if (battle.state === 'fight') {
    drawMoveMenu(ctx, playerMon, battle.moveIndex, movesData);
  } else if (battle.state === 'message') {
    drawBattleMessage(ctx, battle.message);
  }

  ctx.restore(); // undo shake transform
}

function drawBattleMenu(ctx: CanvasRenderingContext2D, selectedIndex: number): void {
  const options = ['FIGHT', 'CACHE', 'RUN'];
  const startX = 24;
  const spacing = 155;

  options.forEach((opt, i) => {
    const x = startX + i * spacing;
    const y = 272;
    const selected = i === selectedIndex;

    if (selected) {
      // Selection indicator — neon box
      glow(ctx, Color.accentCyan, 6);
      ctx.strokeStyle = Color.accentCyan;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 8, y - 14, ctx.measureText(opt).width + 20, 22);
      clearGlow(ctx);
    }

    ctx.font = selected ? Font.body : Font.small;
    ctx.fillStyle = selected ? Color.accentCyan : Color.textPrimary;
    ctx.fillText(opt, x, y);
  });

  // Keyboard hint
  ctx.font = Font.label;
  ctx.fillStyle = Color.textDisabled;
  ctx.fillText('[←→] Select   [ENTER] Confirm', 120, 305);
}

function drawMoveMenu(
  ctx: CanvasRenderingContext2D,
  playerMon: BattleMon,
  moveIndex: number,
  movesData: MoveData[]
): void {
  const moves = playerMon.moves;
  // 2×2 grid layout for moves
  moves.forEach((moveId, i) => {
    const move = movesData.find((m) => m.id === moveId);
    if (!move) return;

    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 20 + col * 230;
    const y = 260 + row * 24;
    const selected = i === moveIndex;

    // Type color dot
    if (move.type) {
      const tc = TypeColor[move.type] || Color.textSecondary;
      ctx.fillStyle = tc;
      ctx.beginPath();
      ctx.arc(x, y - 3, 4, 0, Math.PI * 2);
      ctx.fill();

      // Type label next to name
      if (selected) {
        ctx.font = Font.label;
        ctx.fillStyle = tc;
        const nameWidth = ctx.measureText(move.name).width;
        ctx.fillText(move.type.toUpperCase(), x + 12 + nameWidth + 6, y);
      }
    }

    ctx.font = selected ? Font.body : Font.small;
    ctx.fillStyle = selected ? Color.accentCyan : Color.textPrimary;
    ctx.fillText(move.name, x + 12, y);
  });

  // Keyboard hint
  ctx.font = Font.label;
  ctx.fillStyle = Color.textDisabled;
  ctx.fillText('[←→↑↓] Select   [ENTER] Use   [ESC] Back', 90, 305);
}

function drawBattleMessage(ctx: CanvasRenderingContext2D, message: string): void {
  ctx.font = Font.body;
  ctx.fillStyle = Color.textPrimary;

  // Word-wrap long messages
  const maxWidth = CANVAS_W - 40;
  const words = message.split(' ');
  let line = '';
  let y = 268;

  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, 20, y);
      line = word;
      y += 20;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, 20, y);
}

// ── HP Bar (themed, with animation support) ──────────────────────────────

function drawHPBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  current: number,
  max: number
): void {
  const pct = Math.max(0, Math.min(1, current / max));

  // Background
  ctx.fillStyle = Color.bgSurface;
  ctx.fillRect(x, y, width, 8);

  // Fill
  const fillColor = hpColor(current, max);
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, width * pct, 8);

  // Border
  ctx.strokeStyle = Color.glassBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, 8);

  // HP text
  ctx.fillStyle = Color.textPrimary;
  ctx.font = Font.label;
  ctx.fillText(`${Math.max(0, Math.ceil(current))}/${max}`, x + width + 5, y + 8);
}

// ── Grimoire ─────────────────────────────────────────────────────────────

interface GrimoireEntry {
  id: number;
  name: string;
  type: string;
  color?: string;
  sprite?: string;
  discovered: boolean;
  encounters?: number;
}

let grimoireScroll = 0;

export function setGrimoireScroll(delta: number): void {
  grimoireScroll = Math.max(0, grimoireScroll + delta);
}

export function resetGrimoireScroll(): void {
  grimoireScroll = 0;
}

export function drawGrimoire(
  entries: GrimoireEntry[],
  discoveredIds: Set<number>
): void {
  if (!ctx) return;

  // Background
  ctx.fillStyle = Color.bgDeep;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Title
  ctx.font = Font.heading;
  glow(ctx, Color.accentPurple, 10);
  ctx.fillStyle = Color.accentPurple;
  ctx.textAlign = 'center';
  ctx.fillText('BUG GRIMOIRE', CANVAS_W / 2, 28);
  clearGlow(ctx);
  ctx.textAlign = 'left';

  // Subtitle
  ctx.font = Font.small;
  ctx.fillStyle = Color.textSecondary;
  ctx.textAlign = 'center';
  const discovered = entries.filter((e) => discoveredIds.has(e.id)).length;
  ctx.fillText(`${discovered}/${entries.length} Discovered`, CANVAS_W / 2, 46);
  ctx.textAlign = 'left';

  // Grid of entries (4 columns, scrollable)
  const cols = 4;
  const cellW = 112;
  const cellH = 56;
  const startY = 56;
  const visibleRows = 4;

  const startIdx = grimoireScroll * cols;
  const endIdx = Math.min(entries.length, startIdx + visibleRows * cols);

  for (let i = startIdx; i < endIdx; i++) {
    const entry = entries[i];
    const localIdx = i - startIdx;
    const col = localIdx % cols;
    const row = Math.floor(localIdx / cols);
    const x = 12 + col * cellW;
    const y = startY + row * cellH;
    const known = discoveredIds.has(entry.id);

    // Card background
    ctx.fillStyle = known ? Color.bgSurface : 'rgba(22,33,62,0.4)';
    ctx.fillRect(x, y, cellW - 8, cellH - 4);

    // Type-colored left border
    if (known && entry.type) {
      ctx.fillStyle = TypeColor[entry.type] || Color.textSecondary;
      ctx.fillRect(x, y, 3, cellH - 4);
    }

    if (known) {
      // Mini sprite
      if (entry.sprite && drawSprite(ctx, entry.sprite, x + 6, y + 6, 32, 32)) {
        // drawn
      } else {
        const sprite = generateMonster(entry.id, entry.color || '#888', 32);
        ctx.drawImage(sprite, x + 6, y + 6);
      }

      // Name
      ctx.font = Font.label;
      ctx.fillStyle = Color.textPrimary;
      ctx.fillText(entry.name, x + 42, y + 20);

      // Type
      ctx.fillStyle = TypeColor[entry.type] || Color.textSecondary;
      ctx.font = Font.label;
      ctx.fillText(entry.type, x + 42, y + 34);

      // Encounter count
      if (entry.encounters) {
        ctx.fillStyle = Color.textDisabled;
        ctx.fillText(`×${entry.encounters}`, x + 42, y + 46);
      }
    } else {
      // Unknown silhouette
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + 10, y + 8, 28, 28);
      ctx.font = Font.small;
      ctx.fillStyle = Color.textDisabled;
      ctx.fillText('???', x + 50, y + 28);
    }
  }

  // Scroll indicators
  if (grimoireScroll > 0) {
    ctx.font = Font.label;
    ctx.fillStyle = Color.textDisabled;
    ctx.textAlign = 'center';
    ctx.fillText('▲', CANVAS_W / 2, startY - 2);
    ctx.textAlign = 'left';
  }
  if (endIdx < entries.length) {
    ctx.font = Font.label;
    ctx.fillStyle = Color.textDisabled;
    ctx.textAlign = 'center';
    ctx.fillText('▼', CANVAS_W / 2, CANVAS_H - 10);
    ctx.textAlign = 'left';
  }

  // Footer hint
  ctx.font = Font.label;
  ctx.fillStyle = Color.textDisabled;
  ctx.textAlign = 'center';
  ctx.fillText('[↑↓] Scroll   [ESC] Back', CANVAS_W / 2, CANVAS_H - 4);
  ctx.textAlign = 'left';
}

// ── Idle feed overlay (for explore state) ────────────────────────────────

export function drawIdleOverlay(): void {
  if (!ctx) return;
  drawIdleFeed(ctx);
}

// ── Clear ────────────────────────────────────────────────────────────────

export function clear(): void {
  if (ctx) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
}
