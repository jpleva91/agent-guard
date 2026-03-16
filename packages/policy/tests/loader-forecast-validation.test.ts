// Tests for policy loader validation of forecast conditions
import { describe, it, expect } from 'vitest';
import { validatePolicy } from '@red-codes/policy';

describe('policy loader forecast condition validation', () => {
  it('accepts valid forecast conditions', () => {
    const result = validatePolicy({
      id: 'test',
      name: 'Test',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: {
            forecast: {
              testRiskScore: 50,
              blastRadiusScore: 30,
              riskLevel: ['high', 'medium'],
              predictedFileCount: 10,
              dependencyCount: 5,
            },
          },
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects forecast with non-number testRiskScore', () => {
    const result = validatePolicy({
      id: 'test',
      name: 'Test',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { forecast: { testRiskScore: 'high' } },
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rule[0]: Forecast condition "testRiskScore" must be a number');
  });

  it('rejects forecast with non-number blastRadiusScore', () => {
    const result = validatePolicy({
      id: 'test',
      name: 'Test',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { forecast: { blastRadiusScore: true } },
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Rule[0]: Forecast condition "blastRadiusScore" must be a number'
    );
  });

  it('rejects forecast with non-array riskLevel', () => {
    const result = validatePolicy({
      id: 'test',
      name: 'Test',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { forecast: { riskLevel: 'high' } },
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rule[0]: Forecast condition "riskLevel" must be an array');
  });

  it('rejects forecast with invalid riskLevel values', () => {
    const result = validatePolicy({
      id: 'test',
      name: 'Test',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { forecast: { riskLevel: ['high', 'extreme'] } },
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Rule[0]: Forecast condition "riskLevel" contains invalid value: extreme. Must be "low", "medium", or "high"'
    );
  });

  it('rejects non-object forecast condition', () => {
    const result = validatePolicy({
      id: 'test',
      name: 'Test',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { forecast: 'invalid' },
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rule[0]: Condition "forecast" must be an object');
  });

  it('rejects forecast with non-number predictedFileCount', () => {
    const result = validatePolicy({
      id: 'test',
      name: 'Test',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { forecast: { predictedFileCount: 'many' } },
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Rule[0]: Forecast condition "predictedFileCount" must be a number'
    );
  });

  it('rejects forecast with non-number dependencyCount', () => {
    const result = validatePolicy({
      id: 'test',
      name: 'Test',
      rules: [
        {
          action: 'file.write',
          effect: 'deny',
          conditions: { forecast: { dependencyCount: false } },
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Rule[0]: Forecast condition "dependencyCount" must be a number'
    );
  });
});
