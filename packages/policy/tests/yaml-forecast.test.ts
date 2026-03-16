// Tests for YAML loader parsing of forecast conditions
import { describe, it, expect } from 'vitest';
import { loadYamlPolicy } from '@red-codes/policy';

describe('YAML forecast condition parsing', () => {
  it('parses forecast block with testRiskScore', () => {
    const yaml = `
id: forecast-test
name: Forecast Test
rules:
  - action: file.write
    effect: deny
    forecast:
      testRiskScore: 50
    reason: High test risk
`;
    const policy = loadYamlPolicy(yaml);
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].conditions?.forecast).toEqual({
      testRiskScore: 50,
    });
  });

  it('parses forecast block with multiple fields', () => {
    const yaml = `
id: forecast-multi
name: Forecast Multi
rules:
  - action: file.write
    effect: deny
    forecast:
      testRiskScore: 50
      blastRadiusScore: 30
      predictedFileCount: 10
      dependencyCount: 5
`;
    const policy = loadYamlPolicy(yaml);
    expect(policy.rules[0].conditions?.forecast).toEqual({
      testRiskScore: 50,
      blastRadiusScore: 30,
      predictedFileCount: 10,
      dependencyCount: 5,
    });
  });

  it('parses forecast riskLevel as inline array', () => {
    const yaml = `
id: forecast-risk
name: Forecast Risk
rules:
  - action: file.write
    effect: deny
    forecast:
      riskLevel: [high, medium]
`;
    const policy = loadYamlPolicy(yaml);
    expect(policy.rules[0].conditions?.forecast?.riskLevel).toEqual(['high', 'medium']);
  });

  it('parses forecast riskLevel as single value', () => {
    const yaml = `
id: forecast-risk-single
name: Forecast Risk Single
rules:
  - action: file.write
    effect: deny
    forecast:
      riskLevel: high
`;
    const policy = loadYamlPolicy(yaml);
    expect(policy.rules[0].conditions?.forecast?.riskLevel).toEqual(['high']);
  });

  it('produces no forecast condition when forecast block is absent', () => {
    const yaml = `
id: no-forecast
name: No Forecast
rules:
  - action: file.write
    effect: deny
    reason: Simple deny
`;
    const policy = loadYamlPolicy(yaml);
    expect(policy.rules[0].conditions?.forecast).toBeUndefined();
  });

  it('filters out invalid riskLevel values in inline array', () => {
    const yaml = `
id: forecast-invalid-risk
name: Forecast Invalid Risk
rules:
  - action: file.write
    effect: deny
    forecast:
      riskLevel: [high, critical, unknown]
`;
    const policy = loadYamlPolicy(yaml);
    // 'critical' and 'unknown' are not valid — only 'high' survives
    expect(policy.rules[0].conditions?.forecast?.riskLevel).toEqual(['high']);
  });

  it('ignores single invalid riskLevel value', () => {
    const yaml = `
id: forecast-invalid-single
name: Forecast Invalid Single
rules:
  - action: file.write
    effect: deny
    forecast:
      riskLevel: critical
`;
    const policy = loadYamlPolicy(yaml);
    // Invalid value — riskLevel should not be set
    expect(policy.rules[0].conditions?.forecast?.riskLevel).toBeUndefined();
  });
});
