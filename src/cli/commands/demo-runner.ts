/**
 * demo-runner — Launch a BugMon demo encounter from the CLI.
 *
 * Used by both `agentguard play` and `agentguard demo`.
 * Spawns a synthetic error and runs the encounter pipeline.
 */

import { parseErrors } from '../../core/error-parser.js';
import { matchMonster } from '../../core/matcher.js';
import { renderEncounter } from '../renderer.js';
import { loadBugDex } from '../../ecosystem/storage.js';

interface DemoScenario {
  name: string;
  errorMessage: string;
  source: string;
  file: string;
}

const SCENARIOS: Record<string, DemoScenario> = {
  'null-error': {
    name: 'NullPointer',
    errorMessage: "TypeError: Cannot read properties of undefined (reading 'length')",
    source: 'test',
    file: 'src/app.ts:42',
  },
  'syntax-error': {
    name: 'SyntaxError',
    errorMessage: "SyntaxError: Unexpected token '}'",
    source: 'build',
    file: 'src/config.ts:8',
  },
  'type-error': {
    name: 'TypeCoercion',
    errorMessage: 'error TS2322: Type "string" is not assignable to type "number"',
    source: 'build',
    file: 'src/types.ts:15',
  },
  'import-error': {
    name: 'ImportError',
    errorMessage: "Error: Cannot find module './missing-module'",
    source: 'runtime',
    file: 'src/index.ts:3',
  },
};

const DEFAULT_SCENARIO = 'null-error';

export async function demo(scenario?: string): Promise<void> {
  const key = scenario || DEFAULT_SCENARIO;
  const sc = SCENARIOS[key];

  if (!sc) {
    console.log(`\n  \x1b[1mBugMon Mode\x1b[0m — Available demo scenarios:\n`);
    for (const [name, s] of Object.entries(SCENARIOS)) {
      console.log(`    ${name.padEnd(16)} ${s.errorMessage.slice(0, 60)}`);
    }
    console.log(`\n  Usage: agentguard play <scenario>\n`);
    return;
  }

  console.log(`\n  \x1b[1m\x1b[35m⚔ BugMon Mode\x1b[0m — Demo Encounter\n`);

  const errors = parseErrors(sc.errorMessage);
  if (errors.length === 0) {
    console.log(`  \x1b[2mNo errors parsed from scenario "${key}".\x1b[0m\n`);
    return;
  }

  const error = errors[0];
  const match = matchMonster(error);
  if (!match) {
    console.log(`  \x1b[2mNo monster matched for "${error.type}".\x1b[0m\n`);
    return;
  }

  renderEncounter(match.monster, error, { file: sc.file }, match.confidence);

  const dex = loadBugDex() as Record<string, unknown>;
  const party = dex.party as unknown[] | undefined;

  if (party && party.length > 0) {
    console.log('  \x1b[2mYou have BugMon in your party! Use --cache with watch to battle.\x1b[0m');
  }

  console.log(`\n  \x1b[2mThis was a demo. Use "${process.argv[1]?.endsWith('bugmon') ? 'bugmon' : 'agentguard'} watch -- <command>" to catch real bugs.\x1b[0m\n`);
}
