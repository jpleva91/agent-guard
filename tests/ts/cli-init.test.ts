// Tests for CLI init command — scaffold governance extensions
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { init } from '../../src/cli/commands/init.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(existsSync).mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('init command', () => {
  describe('argument parsing', () => {
    it('should print help and return 1 when no arguments provided', async () => {
      const code = await init([]);
      expect(code).toBe(1);
      expect(console.log).toHaveBeenCalled();
    });

    it('should return 1 for unknown extension type', async () => {
      const code = await init(['--extension', 'bogus']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalled();
    });

    it('should accept extension type as positional argument', async () => {
      const code = await init(['renderer', '--name', 'test-ext']);
      expect(code).toBe(0);
    });

    it('should accept extension type via --extension flag', async () => {
      const code = await init(['--extension', 'renderer', '--name', 'test-ext']);
      expect(code).toBe(0);
    });

    it('should accept -e alias for --extension', async () => {
      const code = await init(['-e', 'renderer', '-n', 'test-ext']);
      expect(code).toBe(0);
    });
  });

  describe('directory conflict', () => {
    it('should return 1 if target directory already exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const code = await init(['--extension', 'renderer', '--name', 'existing-dir']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('extension scaffolding', () => {
    const extensionTypes = [
      'invariant',
      'policy-pack',
      'adapter',
      'renderer',
      'replay-processor',
    ] as const;

    for (const type of extensionTypes) {
      describe(`${type} scaffold`, () => {
        it('should create directories and files', async () => {
          const code = await init(['--extension', type, '--name', `test-${type}`]);
          expect(code).toBe(0);

          // Should create the target directory with src/ and tests/ subdirs
          expect(mkdirSync).toHaveBeenCalled();

          // Should write files
          expect(writeFileSync).toHaveBeenCalled();

          // Verify package.json is among the written files
          const writeCalls = vi.mocked(writeFileSync).mock.calls;
          const pkgCall = writeCalls.find(
            (call) => typeof call[0] === 'string' && call[0].endsWith('package.json')
          );
          expect(pkgCall).toBeDefined();

          if (pkgCall) {
            const pkg = JSON.parse(pkgCall[1] as string) as {
              name: string;
              agentguard: { id: string; type: string; apiVersion: string };
            };
            expect(pkg.name).toBe(`agentguard-test-${type}`);
            expect(pkg.agentguard).toBeDefined();
            expect(pkg.agentguard.id).toBe(`agentguard-test-${type}`);
            expect(pkg.agentguard.apiVersion).toBe('^1.0.0');
          }
        });

        it('should produce a success message', async () => {
          const code = await init(['--extension', type, '--name', `test-${type}`]);
          expect(code).toBe(0);
          expect(console.log).toHaveBeenCalled();
        });
      });
    }

    it('should generate README for all extension types', async () => {
      for (const type of extensionTypes) {
        vi.clearAllMocks();
        vi.mocked(existsSync).mockReturnValue(false);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await init(['--extension', type, '--name', `readme-${type}`]);

        const writeCalls = vi.mocked(writeFileSync).mock.calls;
        const readmeCall = writeCalls.find(
          (call) => typeof call[0] === 'string' && call[0].endsWith('README.md')
        );
        expect(readmeCall, `README.md should be generated for ${type}`).toBeDefined();
      }
    });

    it('should generate test files for non-policy-pack types', async () => {
      const typesWithTests = ['invariant', 'adapter', 'renderer', 'replay-processor'] as const;

      for (const type of typesWithTests) {
        vi.clearAllMocks();
        vi.mocked(existsSync).mockReturnValue(false);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await init(['--extension', type, '--name', `test-${type}`]);

        const writeCalls = vi.mocked(writeFileSync).mock.calls;
        const testCall = writeCalls.find(
          (call) => typeof call[0] === 'string' && (call[0] as string).includes('tests/')
        );
        expect(testCall, `Test file should be generated for ${type}`).toBeDefined();
      }
    });

    it('should generate YAML policy file for policy-pack', async () => {
      await init(['--extension', 'policy-pack', '--name', 'test-pack']);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const yamlCall = writeCalls.find(
        (call) =>
          typeof call[0] === 'string' && (call[0] as string).endsWith('agentguard-pack.yaml')
      );
      expect(yamlCall).toBeDefined();
      if (yamlCall) {
        const content = yamlCall[1] as string;
        expect(content).toContain('rules:');
        expect(content).toContain('effect: deny');
        expect(content).toContain('effect: allow');
      }
    });

    it('should generate TypeScript source for non-policy-pack types', async () => {
      const typesWithTs = ['invariant', 'adapter', 'renderer', 'replay-processor'] as const;

      for (const type of typesWithTs) {
        vi.clearAllMocks();
        vi.mocked(existsSync).mockReturnValue(false);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await init(['--extension', type, '--name', `ts-${type}`]);

        const writeCalls = vi.mocked(writeFileSync).mock.calls;
        const srcCall = writeCalls.find(
          (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('src/index.ts')
        );
        expect(srcCall, `src/index.ts should be generated for ${type}`).toBeDefined();
      }
    });
  });

  describe('default naming', () => {
    it('should use my-<type> as default name when --name not provided', async () => {
      const code = await init(['--extension', 'renderer']);
      expect(code).toBe(0);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const pkgCall = writeCalls.find(
        (call) => typeof call[0] === 'string' && call[0].endsWith('package.json')
      );
      expect(pkgCall).toBeDefined();
      if (pkgCall) {
        const pkg = JSON.parse(pkgCall[1] as string) as { name: string };
        expect(pkg.name).toBe('agentguard-my-renderer');
      }
    });
  });

  describe('custom directory', () => {
    it('should use --dir when provided', async () => {
      const code = await init([
        '--extension',
        'renderer',
        '--name',
        'test',
        '--dir',
        '/tmp/custom-dir',
      ]);
      expect(code).toBe(0);

      // The first mkdirSync call should include the custom dir
      const mkdirCalls = vi.mocked(mkdirSync).mock.calls;
      const hasCustomDir = mkdirCalls.some(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('custom-dir')
      );
      expect(hasCustomDir).toBe(true);
    });
  });

  describe('valid extension types', () => {
    it('should accept all five extension types', async () => {
      const types = ['invariant', 'policy-pack', 'adapter', 'renderer', 'replay-processor'];
      for (const type of types) {
        vi.clearAllMocks();
        vi.mocked(existsSync).mockReturnValue(false);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const code = await init(['--extension', type, '--name', `valid-${type}`]);
        expect(code, `Extension type "${type}" should be valid`).toBe(0);
      }
    });
  });
});
