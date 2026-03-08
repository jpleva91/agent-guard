import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/core/event-bus.js';
import { BugEngine } from '../../src/core/bug-engine.js';
import { BugRegistry } from '../../src/core/bug-registry.js';
import type { BugEvent, EventMap, Monster } from '../../src/core/types.js';

function makeBug(id: string, severity: 1 | 2 | 3 | 4 | 5 = 3): BugEvent {
  return {
    id,
    type: 'TypeError',
    source: 'console',
    errorMessage: `TypeError: Cannot read property of ${id}`,
    timestamp: Date.now(),
    severity,
  };
}

describe('BugEngine', () => {
  let eventBus: EventBus<EventMap>;
  let registry: BugRegistry;
  let engine: BugEngine;

  beforeEach(() => {
    eventBus = new EventBus<EventMap>();
    registry = new BugRegistry();
    engine = new BugEngine(eventBus, registry);
    engine.start();
  });

  it('should register a bug and spawn a monster on BugDetected', () => {
    let spawned: { monster: Monster; bug: BugEvent } | null = null;
    eventBus.on('MonsterSpawned', (payload) => {
      spawned = payload;
    });

    const bug = makeBug('b1');
    eventBus.emit('BugDetected', { bug });

    expect(spawned).not.toBeNull();
    expect(spawned!.bug.id).toBe('b1');
    expect(spawned!.monster.type).toBe('backend'); // console → backend
    expect(spawned!.monster.hp).toBe(45); // severity 3 → 45 hp
  });

  it('should not duplicate bugs', () => {
    let spawnCount = 0;
    eventBus.on('MonsterSpawned', () => {
      spawnCount++;
    });

    const bug = makeBug('b1');
    eventBus.emit('BugDetected', { bug });
    eventBus.emit('BugDetected', { bug });

    expect(spawnCount).toBe(1);
  });

  it('should resolve bugs and emit MonsterDefeated', () => {
    let defeated: { monsterId: number; xp: number } | null = null;
    eventBus.on('MonsterDefeated', (payload) => {
      defeated = payload;
    });

    const bug = makeBug('b1', 3);
    eventBus.emit('BugDetected', { bug });
    engine.resolveBug('b1');

    expect(defeated).not.toBeNull();
    expect(defeated!.xp).toBe(45 + 12); // maxHp + attack for severity 3
  });

  it('should not resolve non-existent bugs', () => {
    let defeated = false;
    eventBus.on('MonsterDefeated', () => {
      defeated = true;
    });

    engine.resolveBug('nope');
    expect(defeated).toBe(false);
  });

  it('should track active bugs', () => {
    eventBus.emit('BugDetected', { bug: makeBug('b1') });
    eventBus.emit('BugDetected', { bug: makeBug('b2') });

    expect(engine.getActiveBugs()).toHaveLength(2);

    engine.resolveBug('b1');
    expect(engine.getActiveBugs()).toHaveLength(1);
  });

  it('should map severity to monster stats', () => {
    let monster: Monster | null = null;
    eventBus.on('MonsterSpawned', (payload) => {
      monster = payload.monster;
    });

    // Severity 1 → weak monster
    eventBus.emit('BugDetected', { bug: makeBug('low', 1) });
    expect(monster!.maxHp).toBe(20);
    expect(monster!.attack).toBe(5);

    // Severity 5 → strong monster
    eventBus.emit('BugDetected', { bug: makeBug('high', 5) });
    expect(monster!.maxHp).toBe(80);
    expect(monster!.attack).toBe(20);
  });

  it('should stop listening when stopped', () => {
    engine.stop();

    let spawnCount = 0;
    eventBus.on('MonsterSpawned', () => {
      spawnCount++;
    });

    eventBus.emit('BugDetected', { bug: makeBug('b1') });
    expect(spawnCount).toBe(0);
  });
});
