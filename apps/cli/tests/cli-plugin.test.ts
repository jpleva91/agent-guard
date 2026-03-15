// Tests for CLI plugin command — manage installed plugins
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// Mock @red-codes/plugins
const mockRegistry = {
  list: vi.fn(),
  install: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
};

vi.mock('@red-codes/plugins', () => ({
  createPluginRegistry: vi.fn(() => mockRegistry),
  searchNpmPlugins: vi.fn(async () => []),
  searchLocalPlugins: vi.fn(() => []),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../src/colors.js', () => ({
  bold: (text: string) => text,
  color: (text: string) => text,
  dim: (text: string) => text,
}));

import { plugin } from '../src/commands/plugin.js';
import { createPluginRegistry, searchNpmPlugins, searchLocalPlugins } from '@red-codes/plugins';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('plugin command', () => {
  describe('subcommand routing', () => {
    it('routes to list for "list"', async () => {
      mockRegistry.list.mockReturnValue([]);
      const code = await plugin(['list']);
      expect(code).toBe(0);
      expect(mockRegistry.list).toHaveBeenCalled();
    });

    it('routes to list for "ls"', async () => {
      mockRegistry.list.mockReturnValue([]);
      const code = await plugin(['ls']);
      expect(code).toBe(0);
      expect(mockRegistry.list).toHaveBeenCalled();
    });

    it('routes to install for "install"', async () => {
      const code = await plugin(['install']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a plugin source')
      );
    });

    it('routes to install for "add"', async () => {
      const code = await plugin(['add']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a plugin source')
      );
    });

    it('routes to remove for "remove"', async () => {
      const code = await plugin(['remove']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a plugin ID to remove')
      );
    });

    it('routes to remove for "rm"', async () => {
      const code = await plugin(['rm']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a plugin ID to remove')
      );
    });

    it('returns 0 for "help"', async () => {
      const code = await plugin(['help']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalled();
    });

    it('returns 0 for "--help"', async () => {
      const code = await plugin(['--help']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalled();
    });

    it('returns 0 for "-h"', async () => {
      const code = await plugin(['-h']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalled();
    });

    it('returns 0 when no args given (undefined subcommand)', async () => {
      const code = await plugin([]);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalled();
    });

    it('returns 1 for unknown subcommand', async () => {
      const code = await plugin(['bogus']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Unknown plugin subcommand: bogus')
      );
    });
  });

  describe('pluginList', () => {
    it('returns 0 with "No plugins installed" when registry is empty', async () => {
      mockRegistry.list.mockReturnValue([]);
      const code = await plugin(['list']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No plugins installed'));
    });

    it('returns 0 and prints plugin info when plugins exist', async () => {
      mockRegistry.list.mockReturnValue([
        {
          manifest: {
            id: 'test-plugin',
            name: 'Test Plugin',
            version: '1.0.0',
            type: 'renderer',
            description: 'A test plugin',
            capabilities: ['render'],
          },
          enabled: true,
          source: '/path/to/plugin',
        },
      ]);
      const code = await plugin(['list']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Installed Plugins'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test Plugin'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test-plugin'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('renderer'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('enabled'));
    });
  });

  describe('pluginInstall', () => {
    it('returns 1 when no source arg is given', async () => {
      const code = await plugin(['install']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a plugin source')
      );
    });

    it('returns 1 when manifest file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const code = await plugin(['install', './my-plugin']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not find a valid plugin manifest')
      );
    });

    it('returns 0 on successful install', async () => {
      const manifest = {
        id: 'my-plugin',
        name: 'My Plugin',
        version: '1.0.0',
        type: 'renderer',
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ agentguard: manifest }));
      mockRegistry.install.mockReturnValue({ valid: true, errors: [] });

      const code = await plugin(['install', './my-plugin']);
      expect(code).toBe(0);
      expect(mockRegistry.install).toHaveBeenCalledWith(manifest, expect.any(String));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Installed'));
    });

    it('returns 1 when validation fails', async () => {
      const manifest = {
        id: 'bad-plugin',
        name: 'Bad Plugin',
        version: '0.0.1',
        type: 'renderer',
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ agentguard: manifest }));
      mockRegistry.install.mockReturnValue({
        valid: false,
        errors: [{ field: 'type', message: 'Invalid plugin type' }],
      });

      const code = await plugin(['install', './bad-plugin']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Installation failed'));
    });
  });

  describe('pluginRemove', () => {
    it('returns 1 when no ID arg given', async () => {
      const code = await plugin(['remove']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a plugin ID to remove')
      );
    });

    it('returns 1 when plugin not found', async () => {
      mockRegistry.get.mockReturnValue(null);
      const code = await plugin(['remove', 'nonexistent']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not installed'));
    });

    it('returns 0 on successful removal', async () => {
      mockRegistry.get.mockReturnValue({
        manifest: { id: 'test-plugin', name: 'Test Plugin', version: '1.0.0' },
        enabled: true,
        source: '/path/to/plugin',
      });
      mockRegistry.remove.mockReturnValue(true);

      const code = await plugin(['remove', 'test-plugin']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
    });

    it('returns 1 when removal blocked by dependencies', async () => {
      mockRegistry.get.mockReturnValue({
        manifest: { id: 'dep-plugin', name: 'Dep Plugin', version: '1.0.0' },
        enabled: true,
        source: '/path/to/plugin',
      });
      mockRegistry.remove.mockReturnValue(false);

      const code = await plugin(['remove', 'dep-plugin']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('other plugins depend on it')
      );
    });
  });

  describe('pluginEnable', () => {
    it('returns 1 when no ID given', async () => {
      const code = await plugin(['enable']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a plugin ID to enable')
      );
    });

    it('returns 1 when plugin not found', async () => {
      mockRegistry.enable.mockReturnValue(false);
      const code = await plugin(['enable', 'nonexistent']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not installed'));
    });

    it('returns 0 on success', async () => {
      mockRegistry.enable.mockReturnValue(true);
      const code = await plugin(['enable', 'my-plugin']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Enabled'));
    });
  });

  describe('pluginDisable', () => {
    it('returns 1 when no ID given', async () => {
      const code = await plugin(['disable']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Please specify a plugin ID to disable')
      );
    });

    it('returns 1 when plugin not found', async () => {
      mockRegistry.disable.mockReturnValue(false);
      const code = await plugin(['disable', 'nonexistent']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not installed'));
    });

    it('returns 0 on success', async () => {
      mockRegistry.disable.mockReturnValue(true);
      const code = await plugin(['disable', 'my-plugin']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Disabled'));
    });
  });

  describe('pluginSearch', () => {
    it('returns 0 and shows "No plugins found" when both searches return empty', async () => {
      vi.mocked(searchNpmPlugins).mockResolvedValue([]);
      vi.mocked(searchLocalPlugins).mockReturnValue([]);
      const code = await plugin(['search', 'renderer']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No plugins found'));
    });

    it('returns 0 and shows npm results', async () => {
      vi.mocked(searchNpmPlugins).mockResolvedValue([
        { name: 'agentguard-renderer-json', version: '2.0.0', description: 'JSON renderer' },
      ]);
      const code = await plugin(['search', 'renderer']);
      expect(code).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('npm registry'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('agentguard-renderer-json'));
    });
  });
});
