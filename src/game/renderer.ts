/**
 * Renderer — HTML5 Canvas 2D drawing for BugMon encounters.
 *
 * Handles all visual output: battle scenes, HUD, text rendering.
 * Uses pixel art conventions (no image smoothing).
 */

import type { GameState, Monster, Player } from '../core/types.js';

/** Color map for monster types */
const TYPE_COLORS: Record<string, string> = {
  frontend: '#3498db',
  backend: '#e74c3c',
  devops: '#2ecc71',
  testing: '#f39c12',
  architecture: '#9b59b6',
  security: '#1abc9c',
  ai: '#e67e22',
};

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');

    this.ctx = ctx;
    this.width = canvas.width;
    this.height = canvas.height;

    // Pixel art: disable smoothing
    ctx.imageSmoothingEnabled = false;
  }

  /** Clear the entire canvas. */
  clear(): void {
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** Draw the battle scene with player and monster. */
  drawBattle(player: Player, monster: Monster): void {
    this.clear();

    // Draw monster (right side)
    this.drawMonsterSprite(monster, this.width * 0.65, this.height * 0.2);

    // Draw player indicator (left side)
    this.drawPlayerSprite(player, this.width * 0.15, this.height * 0.5);

    // Draw HP bars
    this.drawHpBar('Player', player.hp, player.maxHp, 20, this.height - 80);
    this.drawHpBar(monster.name, monster.hp, monster.maxHp, this.width - 220, 20);
  }

  /** Draw the HUD overlay with game state info. */
  drawHUD(state: GameState): void {
    const { player, defeatedCount } = state;

    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`Lv.${player.level}  XP:${player.xp}  Defeated:${defeatedCount}`, 10, 16);
    this.ctx.fillText(`Active Bugs: ${state.activeBugs.size}`, 10, 32);
  }

  /** Draw text at a specific position. */
  drawText(text: string, x: number, y: number, color = '#fff', size = 14): void {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px monospace`;
    this.ctx.fillText(text, x, y);
  }

  /** Draw a procedural monster sprite. */
  private drawMonsterSprite(monster: Monster, x: number, y: number): void {
    const color = TYPE_COLORS[monster.type] ?? '#ccc';
    const size = 48 + monster.maxHp / 2;

    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, size, size);

    // Eyes
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + size * 0.2, y + size * 0.25, 8, 8);
    this.ctx.fillRect(x + size * 0.6, y + size * 0.25, 8, 8);

    // Pupils
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(x + size * 0.25, y + size * 0.3, 4, 4);
    this.ctx.fillRect(x + size * 0.65, y + size * 0.3, 4, 4);

    // Name
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '10px monospace';
    this.ctx.fillText(monster.name, x, y + size + 14);
  }

  /** Draw a simple player sprite. */
  private drawPlayerSprite(_player: Player, x: number, y: number): void {
    this.ctx.fillStyle = '#3498db';
    this.ctx.fillRect(x, y, 32, 32);

    // Simple face
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 8, y + 10, 4, 4);
    this.ctx.fillRect(x + 20, y + 10, 4, 4);
    this.ctx.fillRect(x + 10, y + 20, 12, 3);
  }

  /** Draw an HP bar. */
  private drawHpBar(label: string, hp: number, maxHp: number, x: number, y: number): void {
    const barWidth = 200;
    const barHeight = 12;
    const ratio = Math.max(0, hp / maxHp);

    // Background
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(x, y, barWidth, barHeight);

    // Fill
    this.ctx.fillStyle = ratio > 0.5 ? '#2ecc71' : ratio > 0.2 ? '#f39c12' : '#e74c3c';
    this.ctx.fillRect(x, y, barWidth * ratio, barHeight);

    // Border
    this.ctx.strokeStyle = '#fff';
    this.ctx.strokeRect(x, y, barWidth, barHeight);

    // Label
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '10px monospace';
    this.ctx.fillText(`${label}: ${hp}/${maxHp}`, x, y - 4);
  }
}
