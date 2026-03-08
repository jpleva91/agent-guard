/**
 * GameLoop — requestAnimationFrame-based game loop.
 *
 * Drives the game engine tick and renderer at ~60fps.
 * Cleanly separable from the engine for testing.
 */

import type { GameEngine } from './engine.js';
import type { Renderer } from './renderer.js';
import type { GameState } from '../core/types.js';

export class GameLoop {
  private readonly engine: GameEngine;
  private readonly renderer: Renderer;
  private animationId: number | null = null;
  private lastTime = 0;

  constructor(engine: GameEngine, renderer: Renderer) {
    this.engine = engine;
    this.renderer = renderer;
  }

  /** Start the game loop. */
  start(): void {
    this.lastTime = performance.now();
    this.animationId = requestAnimationFrame((t) => this.frame(t));
  }

  /** Stop the game loop. */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private frame(time: number): void {
    const dt = time - this.lastTime;
    this.lastTime = time;

    // Update
    this.engine.tick(dt);

    // Render
    this.renderer.clear();

    if (this.engine.phase === 'battle' && this.engine.currentMonster) {
      this.renderer.drawBattle(this.engine.player, this.engine.currentMonster);
    }

    const state: GameState = {
      player: this.engine.player,
      activeBugs: new Map(),
      defeatedCount: 0,
    };
    this.renderer.drawHUD(state);

    // Schedule next frame
    this.animationId = requestAnimationFrame((t) => this.frame(t));
  }
}
