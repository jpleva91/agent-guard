import { execFileSync } from 'node:child_process';

export type Driver = 'human' | 'claude-code' | 'copilot' | 'opencode' | 'ci';
export type Role = 'developer' | 'reviewer' | 'ops' | 'security' | 'planner';

export const VALID_DRIVERS: Driver[] = ['human', 'claude-code', 'copilot', 'opencode', 'ci'];
export const VALID_ROLES: Role[] = ['developer', 'reviewer', 'ops', 'security', 'planner'];

export function detectDriver(): Driver {
  if (process.env.GITHUB_ACTIONS === 'true') return 'ci';
  if (process.env.COPILOT_AGENT) return 'copilot';
  if (process.env.OPENCODE_HOME) return 'opencode';
  if (process.env.CLAUDE_MODEL) return 'claude-code';
  return 'human';
}

export function detectModel(): string {
  const model = process.env.CLAUDE_MODEL ?? '';
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return model || 'unknown';
}

export function detectProject(): string {
  try {
    return (
      execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
        .trim()
        .split(/[\\/]/)
        .pop() ?? 'unknown'
    );
  } catch {
    return 'unknown';
  }
}
