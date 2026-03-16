// Tests for forecast-based predictive policy conditions in policy evaluator
import { describe, it, expect } from 'vitest';
import { evaluate, matchForecastCondition } from '@red-codes/policy';
import type {
  NormalizedIntent,
  LoadedPolicy,
  IntentForecast,
  ForecastCondition,
  ForecastMatchValues,
} from '@red-codes/policy';

function makeForecast(overrides: Partial<IntentForecast> = {}): IntentForecast {
  return {
    predictedFiles: ['src/foo.ts'],
    dependenciesAffected: ['src/core'],
    testRiskScore: 30,
    blastRadiusScore: 15,
    riskLevel: 'low',
    ...overrides,
  };
}

function makeIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    action: 'file.write',
    target: 'src/foo.ts',
    agent: 'test-agent',
    destructive: false,
    ...overrides,
  };
}

function makeForecastPolicy(
  forecastCond: ForecastCondition,
  effect: 'allow' | 'deny' = 'deny'
): LoadedPolicy {
  return {
    id: 'forecast-policy',
    name: 'Forecast Policy',
    rules: [
      {
        action: 'file.write',
        effect,
        conditions: { forecast: forecastCond },
        reason: 'Forecast condition triggered',
      },
      {
        action: 'file.write',
        effect: 'allow' as const,
        reason: 'Default allow',
      },
    ],
    severity: 3,
  };
}

describe('matchForecastCondition', () => {
  it('returns false when no forecast data is present', () => {
    expect(matchForecastCondition({ testRiskScore: 50 }, undefined).matched).toBe(false);
  });

  it('matches when testRiskScore meets threshold', () => {
    const forecast = makeForecast({ testRiskScore: 60 });
    expect(matchForecastCondition({ testRiskScore: 50 }, forecast).matched).toBe(true);
  });

  it('matches when testRiskScore equals threshold exactly', () => {
    const forecast = makeForecast({ testRiskScore: 50 });
    expect(matchForecastCondition({ testRiskScore: 50 }, forecast).matched).toBe(true);
  });

  it('does not match when testRiskScore is below threshold', () => {
    const forecast = makeForecast({ testRiskScore: 30 });
    expect(matchForecastCondition({ testRiskScore: 50 }, forecast).matched).toBe(false);
  });

  it('matches when blastRadiusScore meets threshold', () => {
    const forecast = makeForecast({ blastRadiusScore: 40 });
    expect(matchForecastCondition({ blastRadiusScore: 30 }, forecast).matched).toBe(true);
  });

  it('does not match when blastRadiusScore is below threshold', () => {
    const forecast = makeForecast({ blastRadiusScore: 10 });
    expect(matchForecastCondition({ blastRadiusScore: 30 }, forecast).matched).toBe(false);
  });

  it('matches when riskLevel is in the specified list', () => {
    const forecast = makeForecast({ riskLevel: 'high' });
    expect(matchForecastCondition({ riskLevel: ['high', 'medium'] }, forecast).matched).toBe(true);
  });

  it('does not match when riskLevel is not in the list', () => {
    const forecast = makeForecast({ riskLevel: 'low' });
    expect(matchForecastCondition({ riskLevel: ['high', 'medium'] }, forecast).matched).toBe(false);
  });

  it('matches when predictedFileCount meets threshold', () => {
    const forecast = makeForecast({ predictedFiles: ['a.ts', 'b.ts', 'c.ts'] });
    expect(matchForecastCondition({ predictedFileCount: 3 }, forecast).matched).toBe(true);
  });

  it('does not match when predictedFileCount is below threshold', () => {
    const forecast = makeForecast({ predictedFiles: ['a.ts'] });
    expect(matchForecastCondition({ predictedFileCount: 3 }, forecast).matched).toBe(false);
  });

  it('matches when dependencyCount meets threshold', () => {
    const forecast = makeForecast({ dependenciesAffected: ['a', 'b', 'c', 'd'] });
    expect(matchForecastCondition({ dependencyCount: 3 }, forecast).matched).toBe(true);
  });

  it('does not match when dependencyCount is below threshold', () => {
    const forecast = makeForecast({ dependenciesAffected: ['a'] });
    expect(matchForecastCondition({ dependencyCount: 3 }, forecast).matched).toBe(false);
  });

  it('requires all specified conditions to match', () => {
    const forecast = makeForecast({ testRiskScore: 80, blastRadiusScore: 10 });
    // testRiskScore passes but blastRadiusScore fails
    expect(
      matchForecastCondition({ testRiskScore: 50, blastRadiusScore: 30 }, forecast).matched
    ).toBe(false);
  });

  it('matches when all specified conditions are met', () => {
    const forecast = makeForecast({ testRiskScore: 80, blastRadiusScore: 40 });
    expect(
      matchForecastCondition({ testRiskScore: 50, blastRadiusScore: 30 }, forecast).matched
    ).toBe(true);
  });

  it('populates forecastValues with actual vs threshold for testRiskScore', () => {
    const forecast = makeForecast({ testRiskScore: 60 });
    const { values } = matchForecastCondition({ testRiskScore: 50 }, forecast);
    expect(values.testRiskScore).toEqual({ actual: 60, threshold: 50 });
  });

  it('populates forecastValues for riskLevel with actual and required', () => {
    const forecast = makeForecast({ riskLevel: 'high' });
    const { values } = matchForecastCondition({ riskLevel: ['high', 'medium'] }, forecast);
    expect(values.riskLevel).toEqual({ actual: 'high', required: ['high', 'medium'] });
  });

  it('populates forecastValues even when condition does not match', () => {
    const forecast = makeForecast({ testRiskScore: 30 });
    const { matched, values } = matchForecastCondition({ testRiskScore: 50 }, forecast);
    expect(matched).toBe(false);
    expect(values.testRiskScore).toEqual({ actual: 30, threshold: 50 });
  });

  it('returns empty values when no forecast data', () => {
    const { values } = matchForecastCondition({ testRiskScore: 50 }, undefined);
    expect(values).toEqual({});
  });
});

describe('forecast conditions in policy evaluation', () => {
  it('denies when forecast testRiskScore exceeds threshold', () => {
    const policy = makeForecastPolicy({ testRiskScore: 50 });
    const intent = makeIntent({ forecast: makeForecast({ testRiskScore: 60 }) });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Forecast condition triggered');
  });

  it('allows when forecast testRiskScore is below threshold', () => {
    const policy = makeForecastPolicy({ testRiskScore: 50 });
    const intent = makeIntent({ forecast: makeForecast({ testRiskScore: 30 }) });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('Default allow');
  });

  it('denies when forecast riskLevel matches', () => {
    const policy = makeForecastPolicy({ riskLevel: ['high'] });
    const intent = makeIntent({ forecast: makeForecast({ riskLevel: 'high' }) });
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(false);
  });

  it('allows when no forecast data on intent (condition cannot match)', () => {
    const policy = makeForecastPolicy({ testRiskScore: 50 });
    const intent = makeIntent(); // no forecast attached
    const result = evaluate(intent, [policy]);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('Default allow');
  });

  it('records forecastMatched in trace conditionDetails', () => {
    const policy = makeForecastPolicy({ testRiskScore: 50 });
    const intent = makeIntent({ forecast: makeForecast({ testRiskScore: 60 }) });
    const result = evaluate(intent, [policy]);
    expect(result.trace).toBeDefined();
    const matchedRule = result.trace!.rulesEvaluated.find((r) => r.outcome === 'match');
    expect(matchedRule).toBeDefined();
    expect(matchedRule!.conditionDetails.forecastMatched).toBe(true);
  });

  it('records forecastValues in trace conditionDetails with actual vs threshold', () => {
    const policy = makeForecastPolicy({ testRiskScore: 50 });
    const intent = makeIntent({ forecast: makeForecast({ testRiskScore: 60 }) });
    const result = evaluate(intent, [policy]);
    const matchedRule = result.trace!.rulesEvaluated.find((r) => r.outcome === 'match');
    const forecastValues = matchedRule!.conditionDetails.forecastValues as ForecastMatchValues;
    expect(forecastValues).toBeDefined();
    expect(forecastValues.testRiskScore).toEqual({ actual: 60, threshold: 50 });
  });

  it('records forecastMatched as false when forecast does not meet threshold', () => {
    const policy = makeForecastPolicy({ testRiskScore: 90 });
    const intent = makeIntent({ forecast: makeForecast({ testRiskScore: 30 }) });
    const result = evaluate(intent, [policy]);
    // The deny rule didn't match, so find it as no-match
    const denyRule = result.trace!.rulesEvaluated.find(
      (r) => r.rule.effect === 'deny' && r.outcome === 'no-match'
    );
    expect(denyRule).toBeDefined();
    expect(denyRule!.conditionDetails.forecastMatched).toBe(false);
    const forecastValues = denyRule!.conditionDetails.forecastValues as ForecastMatchValues;
    expect(forecastValues?.testRiskScore).toEqual({ actual: 30, threshold: 90 });
  });
});

describe('forecast conditions compose with other conditions', () => {
  it('denies only when both scope and forecast match', () => {
    const policy: LoadedPolicy = {
      id: 'composed-policy',
      name: 'Composed Policy',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: {
            scope: ['src/kernel/'],
            forecast: { testRiskScore: 50 },
          },
          reason: 'High risk kernel write',
        },
        {
          action: 'file.write',
          effect: 'allow',
          reason: 'Default allow',
        },
      ],
      severity: 3,
    };

    // Scope matches but forecast doesn't → allow
    const intent1 = makeIntent({
      target: 'src/kernel/kernel.ts',
      forecast: makeForecast({ testRiskScore: 30 }),
    });
    expect(evaluate(intent1, [policy]).allowed).toBe(true);

    // Scope doesn't match but forecast does → allow
    const intent2 = makeIntent({
      target: 'src/cli/bin.ts',
      forecast: makeForecast({ testRiskScore: 80 }),
    });
    expect(evaluate(intent2, [policy]).allowed).toBe(true);

    // Both match → deny
    const intent3 = makeIntent({
      target: 'src/kernel/kernel.ts',
      forecast: makeForecast({ testRiskScore: 80 }),
    });
    expect(evaluate(intent3, [policy]).allowed).toBe(false);
  });

  it('works with branch and forecast conditions together', () => {
    const policy: LoadedPolicy = {
      id: 'branch-forecast-policy',
      name: 'Branch + Forecast Policy',
      rules: [
        {
          action: 'git.push',
          effect: 'deny',
          conditions: {
            branches: ['main'],
            forecast: { blastRadiusScore: 30 },
          },
          reason: 'High blast radius push to main',
        },
        {
          action: 'git.push',
          effect: 'allow',
          reason: 'Default allow',
        },
      ],
      severity: 3,
    };

    // Branch matches, forecast meets threshold → deny
    const intent = makeIntent({
      action: 'git.push',
      branch: 'main',
      forecast: makeForecast({ blastRadiusScore: 40 }),
    });
    expect(evaluate(intent, [policy]).allowed).toBe(false);
    expect(evaluate(intent, [policy]).reason).toBe('High blast radius push to main');
  });
});
