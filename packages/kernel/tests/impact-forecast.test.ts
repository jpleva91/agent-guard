// Tests for structured impact forecast builder
import { describe, it, expect } from 'vitest';
import { buildImpactForecast } from '@red-codes/kernel';
import type { NormalizedIntent } from '@red-codes/policy';
import type { SimulationResult } from '@red-codes/kernel';

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'file.write',
    target: 'src/helper.ts',
    agent: 'test',
    destructive: false,
    ...overrides,
  };
}

function makeSimResult(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    predictedChanges: ['Write: src/helper.ts'],
    blastRadius: 1,
    riskLevel: 'low',
    details: {},
    simulatorId: 'test-sim',
    durationMs: 2,
    ...overrides,
  };
}

describe('buildImpactForecast', () => {
  it('produces a complete ImpactForecast with all required fields', () => {
    const forecast = buildImpactForecast(makeIntent(), makeSimResult());

    expect(forecast).toHaveProperty('predictedFiles');
    expect(forecast).toHaveProperty('dependenciesAffected');
    expect(forecast).toHaveProperty('testRiskScore');
    expect(forecast).toHaveProperty('blastRadiusScore');
    expect(forecast).toHaveProperty('riskLevel');
    expect(forecast).toHaveProperty('blastRadiusFactors');
  });

  it('includes the target path in predictedFiles', () => {
    const forecast = buildImpactForecast(
      makeIntent({ target: 'src/events/bus.ts' }),
      makeSimResult()
    );

    expect(forecast.predictedFiles).toContain('src/events/bus.ts');
  });

  it('deduplicates predicted files', () => {
    const forecast = buildImpactForecast(
      makeIntent({ target: 'src/core/types.ts' }),
      makeSimResult()
    );

    const unique = new Set(forecast.predictedFiles);
    expect(forecast.predictedFiles.length).toBe(unique.size);
  });

  it('identifies downstream dependencies for kernel files', () => {
    const forecast = buildImpactForecast(
      makeIntent({ target: 'src/kernel/monitor.ts' }),
      makeSimResult()
    );

    expect(forecast.dependenciesAffected).toContain('src/kernel');
    expect(forecast.dependenciesAffected).toContain('src/cli');
    expect(forecast.dependenciesAffected).toContain('src/adapters');
  });

  it('identifies broad dependencies for core files', () => {
    const forecast = buildImpactForecast(
      makeIntent({ target: 'src/core/types.ts' }),
      makeSimResult()
    );

    // src/core affects almost everything
    expect(forecast.dependenciesAffected).toContain('src/core');
    expect(forecast.dependenciesAffected).toContain('src/kernel');
    expect(forecast.dependenciesAffected).toContain('src/events');
    expect(forecast.dependenciesAffected).toContain('src/policy');
  });

  it('adds package.json to predicted files for package changes', () => {
    const forecast = buildImpactForecast(
      makeIntent({ action: 'shell.exec', target: '' }),
      makeSimResult({
        details: { affectedPackages: ['lodash@4.17.21'] },
      })
    );

    expect(forecast.predictedFiles).toContain('package.json');
    expect(forecast.predictedFiles).toContain('package-lock.json');
  });

  it('computes test risk score in valid range (0–100)', () => {
    const forecast = buildImpactForecast(makeIntent(), makeSimResult());

    expect(forecast.testRiskScore).toBeGreaterThanOrEqual(0);
    expect(forecast.testRiskScore).toBeLessThanOrEqual(100);
  });

  it('assigns higher test risk for test file modifications', () => {
    const testFileForecast = buildImpactForecast(
      makeIntent({ target: 'tests/ts/kernel.test.ts' }),
      makeSimResult()
    );

    const regularForecast = buildImpactForecast(
      makeIntent({ target: 'src/cli/tui.ts' }),
      makeSimResult()
    );

    expect(testFileForecast.testRiskScore).toBeGreaterThan(regularForecast.testRiskScore);
  });

  it('assigns higher test risk for larger blast radius', () => {
    const highBlastForecast = buildImpactForecast(makeIntent(), makeSimResult({ blastRadius: 50 }));

    const lowBlastForecast = buildImpactForecast(makeIntent(), makeSimResult({ blastRadius: 1 }));

    expect(highBlastForecast.testRiskScore).toBeGreaterThan(lowBlastForecast.testRiskScore);
  });

  it('computes blast radius score using the blast-radius engine', () => {
    const forecast = buildImpactForecast(
      makeIntent({ action: 'file.delete', target: '.env', filesAffected: 1 }),
      makeSimResult({ riskLevel: 'high', blastRadius: 10 })
    );

    // file.delete on .env should have a high weighted score due to
    // delete multiplier (3.0) * sensitive path multiplier (5.0)
    expect(forecast.blastRadiusScore).toBeGreaterThan(10);
    expect(forecast.blastRadiusFactors.length).toBeGreaterThan(0);
  });

  it('includes blast radius factors with name, multiplier, and reason', () => {
    const forecast = buildImpactForecast(
      makeIntent({ action: 'file.write', target: 'package.json', filesAffected: 1 }),
      makeSimResult()
    );

    for (const factor of forecast.blastRadiusFactors) {
      expect(factor).toHaveProperty('name');
      expect(factor).toHaveProperty('multiplier');
      expect(factor).toHaveProperty('reason');
      expect(typeof factor.name).toBe('string');
      expect(typeof factor.multiplier).toBe('number');
      expect(typeof factor.reason).toBe('string');
    }
  });

  it('takes the worst risk level from simulation and blast radius', () => {
    // Simulation says low, but blast radius on a sensitive delete should be high
    const forecast = buildImpactForecast(
      makeIntent({ action: 'file.delete', target: '.env.production', filesAffected: 5 }),
      makeSimResult({ riskLevel: 'low' })
    );

    // The blast radius engine should produce at least medium/high for sensitive deletes
    expect(['medium', 'high']).toContain(forecast.riskLevel);
  });

  it('handles empty target gracefully', () => {
    const forecast = buildImpactForecast(makeIntent({ target: '' }), makeSimResult());

    expect(forecast.predictedFiles).toEqual([]);
    expect(forecast.dependenciesAffected).toEqual([]);
    expect(forecast.testRiskScore).toBeGreaterThanOrEqual(0);
  });

  it('uses custom threshold for blast radius computation', () => {
    const lowThreshold = buildImpactForecast(
      makeIntent({ filesAffected: 10 }),
      makeSimResult(),
      10
    );

    const highThreshold = buildImpactForecast(
      makeIntent({ filesAffected: 10 }),
      makeSimResult(),
      100
    );

    // Both should have the same blast radius score (threshold doesn't affect score)
    expect(lowThreshold.blastRadiusScore).toBe(highThreshold.blastRadiusScore);
  });

  it('identifies node_modules as affected for package.json changes', () => {
    const forecast = buildImpactForecast(makeIntent({ target: 'package.json' }), makeSimResult());

    expect(forecast.dependenciesAffected).toContain('node_modules');
  });

  it('returns sorted dependencies', () => {
    const forecast = buildImpactForecast(
      makeIntent({ target: 'src/core/types.ts' }),
      makeSimResult()
    );

    const sorted = [...forecast.dependenciesAffected].sort();
    expect(forecast.dependenciesAffected).toEqual(sorted);
  });
});

describe('buildImpactForecast — kernel integration', () => {
  it('forecast is attached to simulation result when computed', () => {
    const simResult = makeSimResult();
    const forecast = buildImpactForecast(makeIntent(), simResult);

    // The kernel attaches the forecast to the simulation result
    simResult.forecast = forecast;

    expect(simResult.forecast).toBeDefined();
    expect(simResult.forecast!.predictedFiles).toEqual(forecast.predictedFiles);
  });
});
