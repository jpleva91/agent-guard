import assert from 'node:assert';
import { test, suite } from './run.js';
import {
  createComboState,
  recordResolution,
  recordFailure,
  applyComboXP,
  getTier,
  formatCombo,
} from '../domain/combo.js';

suite('Combo/Streak System (domain/combo.js)', () => {
  // --- createComboState ---
  test('createComboState returns zeroed state', () => {
    const state = createComboState();
    assert.strictEqual(state.streak, 0);
    assert.strictEqual(state.maxStreak, 0);
    assert.strictEqual(state.totalBonusXP, 0);
  });

  // --- recordResolution ---
  test('recordResolution increments streak', () => {
    const state = createComboState();
    const { state: s1 } = recordResolution(state);
    assert.strictEqual(s1.streak, 1);
    const { state: s2 } = recordResolution(s1);
    assert.strictEqual(s2.streak, 2);
  });

  test('recordResolution tracks maxStreak', () => {
    let state = createComboState();
    for (let i = 0; i < 5; i++) {
      const result = recordResolution(state);
      state = result.state;
    }
    assert.strictEqual(state.maxStreak, 5);
  });

  test('recordResolution returns correct multiplier at tier boundaries', () => {
    let state = createComboState();
    // Streak 1: no tier
    const r1 = recordResolution(state);
    assert.strictEqual(r1.multiplier, 1.0);
    assert.strictEqual(r1.tier, null);
    state = r1.state;

    // Streak 2: DOUBLE (1.5x)
    const r2 = recordResolution(state);
    assert.strictEqual(r2.multiplier, 1.5);
    assert.strictEqual(r2.tier.label, 'DOUBLE');
    state = r2.state;

    // Streak 3: COMBO (2x)
    const r3 = recordResolution(state);
    assert.strictEqual(r3.multiplier, 2.0);
    assert.strictEqual(r3.tier.label, 'COMBO');
  });

  // --- recordFailure ---
  test('recordFailure resets streak to zero', () => {
    let state = createComboState();
    for (let i = 0; i < 5; i++) {
      state = recordResolution(state).state;
    }
    assert.strictEqual(state.streak, 5);

    const { state: failed, brokeStreak } = recordFailure(state);
    assert.strictEqual(failed.streak, 0);
    assert.strictEqual(brokeStreak, 5);
    assert.strictEqual(failed.maxStreak, 5); // maxStreak preserved
  });

  // --- applyComboXP ---
  test('applyComboXP calculates bonus correctly', () => {
    const state = createComboState();
    const { state: s1, totalXP, bonusXP } = applyComboXP(state, 50, 2.0);
    assert.strictEqual(totalXP, 100);
    assert.strictEqual(bonusXP, 50);
    assert.strictEqual(s1.totalBonusXP, 50);
  });

  test('applyComboXP with 1x multiplier gives zero bonus', () => {
    const state = createComboState();
    const { totalXP, bonusXP } = applyComboXP(state, 50, 1.0);
    assert.strictEqual(totalXP, 50);
    assert.strictEqual(bonusXP, 0);
  });

  // --- getTier ---
  test('getTier returns null for streak < 2', () => {
    assert.strictEqual(getTier(0), null);
    assert.strictEqual(getTier(1), null);
  });

  test('getTier returns correct tiers', () => {
    assert.strictEqual(getTier(2).label, 'DOUBLE');
    assert.strictEqual(getTier(3).label, 'COMBO');
    assert.strictEqual(getTier(5).label, 'ON FIRE');
    assert.strictEqual(getTier(10).label, 'UNSTOPPABLE');
    assert.strictEqual(getTier(100).label, 'UNSTOPPABLE');
  });

  // --- formatCombo ---
  test('formatCombo returns null when no tier', () => {
    assert.strictEqual(formatCombo(1, null), null);
  });

  test('formatCombo formats correctly', () => {
    const tier = { label: 'COMBO', multiplier: 2.0 };
    assert.strictEqual(formatCombo(3, tier), 'COMBO x3! (2x XP)');
  });

  // --- Full combo flow ---
  test('full combo flow: resolve, resolve, fail, resolve', () => {
    let state = createComboState();

    // First resolution: streak=1, no multiplier
    const r1 = recordResolution(state);
    assert.strictEqual(r1.state.streak, 1);
    assert.strictEqual(r1.multiplier, 1.0);
    state = r1.state;

    // Second: streak=2, DOUBLE
    const r2 = recordResolution(state);
    assert.strictEqual(r2.state.streak, 2);
    assert.strictEqual(r2.multiplier, 1.5);
    state = r2.state;

    // Failure resets
    const f = recordFailure(state);
    assert.strictEqual(f.state.streak, 0);
    assert.strictEqual(f.brokeStreak, 2);
    assert.strictEqual(f.state.maxStreak, 2);
    state = f.state;

    // Rebuild combo
    const r3 = recordResolution(state);
    assert.strictEqual(r3.state.streak, 1);
    assert.strictEqual(r3.state.maxStreak, 2); // still 2 from earlier
  });
});
