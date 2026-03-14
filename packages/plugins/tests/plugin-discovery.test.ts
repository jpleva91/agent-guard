// Tests for plugin discovery — finding available plugins locally.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { searchLocalPlugins } from '@red-codes/plugins';

describe('Plugin Discovery', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentguard-discovery-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('searchLocalPlugins', () => {
    it('should find plugins with agentguard field in package.json', () => {
      // Create a plugin directory
      const pluginDir = join(tempDir, 'my-renderer');
      mkdirSync(pluginDir, { recursive: true });
      writeFileSync(
        join(pluginDir, 'package.json'),
        JSON.stringify({
          name: 'agentguard-renderer-json',
          version: '2.1.0',
          description: 'JSON output renderer for AgentGuard',
          agentguard: { type: 'renderer' },
        }),
        'utf8'
      );

      const results = searchLocalPlugins({ directory: tempDir });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('agentguard-renderer-json');
      expect(results[0].version).toBe('2.1.0');
      expect(results[0].description).toBe('JSON output renderer for AgentGuard');
      expect(results[0].type).toBe('renderer');
      expect(results[0].source).toBe('local');
    });

    it('should skip directories without package.json', () => {
      mkdirSync(join(tempDir, 'no-package'), { recursive: true });

      const results = searchLocalPlugins({ directory: tempDir });

      expect(results).toHaveLength(0);
    });

    it('should skip packages without agentguard field', () => {
      const pluginDir = join(tempDir, 'regular-pkg');
      mkdirSync(pluginDir, { recursive: true });
      writeFileSync(
        join(pluginDir, 'package.json'),
        JSON.stringify({ name: 'regular-package', version: '1.0.0' }),
        'utf8'
      );

      const results = searchLocalPlugins({ directory: tempDir });

      expect(results).toHaveLength(0);
    });

    it('should handle multiple plugins', () => {
      // Plugin 1
      const dir1 = join(tempDir, 'plugin-a');
      mkdirSync(dir1, { recursive: true });
      writeFileSync(
        join(dir1, 'package.json'),
        JSON.stringify({
          name: 'plugin-a',
          version: '1.0.0',
          description: 'First plugin',
          agentguard: { type: 'renderer' },
        }),
        'utf8'
      );

      // Plugin 2
      const dir2 = join(tempDir, 'plugin-b');
      mkdirSync(dir2, { recursive: true });
      writeFileSync(
        join(dir2, 'package.json'),
        JSON.stringify({
          name: 'plugin-b',
          version: '0.5.0',
          description: 'Second plugin',
          agentguard: { type: 'policy-pack' },
        }),
        'utf8'
      );

      const results = searchLocalPlugins({ directory: tempDir });

      expect(results).toHaveLength(2);
      const names = results.map((r) => r.name);
      expect(names).toContain('plugin-a');
      expect(names).toContain('plugin-b');
    });

    it('should return empty for nonexistent directory', () => {
      const results = searchLocalPlugins({ directory: join(tempDir, 'nonexistent') });

      expect(results).toHaveLength(0);
    });

    it('should skip directories with invalid package.json', () => {
      const pluginDir = join(tempDir, 'bad-json');
      mkdirSync(pluginDir, { recursive: true });
      writeFileSync(join(pluginDir, 'package.json'), 'NOT VALID JSON', 'utf8');

      const results = searchLocalPlugins({ directory: tempDir });

      expect(results).toHaveLength(0);
    });

    it('should use directory name as fallback when name is missing', () => {
      const pluginDir = join(tempDir, 'unnamed-plugin');
      mkdirSync(pluginDir, { recursive: true });
      writeFileSync(
        join(pluginDir, 'package.json'),
        JSON.stringify({
          version: '1.0.0',
          agentguard: { type: 'replay-processor' },
        }),
        'utf8'
      );

      const results = searchLocalPlugins({ directory: tempDir });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('unnamed-plugin');
      expect(results[0].type).toBe('replay-processor');
    });
  });
});
