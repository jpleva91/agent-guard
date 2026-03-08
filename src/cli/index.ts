/**
 * AgentGuard CLI — Commander-based entry point.
 *
 * Uses commander for subcommand routing.
 * Available commands: watch, status, demo, play.
 */

import { Command } from 'commander';
import { registerWatchCommand } from './commands/watch.js';
import { registerStatusCommand } from './commands/status.js';
import { registerDemoCommand } from './commands/demo.js';
import { BugRegistry } from '../core/bug-registry.js';

const program = new Command();

program
  .name('agentguard')
  .description('AgentGuard — Deterministic runtime guardrails for AI-assisted software systems')
  .version('0.1.0');

const registry = new BugRegistry();

registerWatchCommand(program);
registerStatusCommand(program, registry);
registerDemoCommand(program);

program.parse();
