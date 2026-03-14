// Tests for CLI init command — scaffold governance extensions
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sep } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { init } from '../src/commands/init.js';

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

            expect(pkg.agentguard.type).toBe(type);

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
          (call) => typeof call[0] === 'string' && (call[0] as string).includes(`tests${sep}`)
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
          (call) => typeof call[0] === 'string' && (call[0] as string).endsWith(`src${sep}index.ts`)
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

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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


      // Next steps output should show the --dir path, not the --name
      const allOutput = consoleSpy.mock.calls.flat().join('\n');
      expect(allOutput).toContain('custom-dir');
      expect(allOutput).not.toContain('cd test');
    });
  });

  describe('name validation', () => {
    it('should reject names with template syntax or special characters', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await init(['--extension', 'renderer', '--name', 'bad`name']);
      expect(code).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid extension name'));
    });

    it('should reject names with uppercase letters', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await init(['--extension', 'renderer', '--name', 'BadName']);
      expect(code).toBe(1);
    });

    it('should accept valid kebab-case names', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const code = await init(['--extension', 'renderer', '--name', 'my-renderer-v2']);
      expect(code).toBe(0);

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

  describe('firestore backend setup', () => {
    it('should scaffold firestore.rules and .env.firestore.example', async () => {
      const code = await init(['firestore']);
      expect(code).toBe(0);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const rulesCall = writeCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('firestore.rules')
      );
      const envCall = writeCalls.find(
        (call) =>
          typeof call[0] === 'string' && (call[0] as string).endsWith('.env.firestore.example')
      );
      expect(rulesCall).toBeDefined();
      expect(envCall).toBeDefined();
    });

    it('should include security rules with append-only writes', async () => {
      await init(['firestore']);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const rulesCall = writeCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('firestore.rules')
      );
      const content = rulesCall?.[1] as string;
      expect(content).toContain('allow update, delete: if false');
      expect(content).toContain('request.auth != null');
      expect(content).toContain('/events/{eventId}');
      expect(content).toContain('/decisions/{decisionId}');
    });

    it('should include env example with required variables', async () => {
      await init(['firestore']);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const envCall = writeCalls.find(
        (call) =>
          typeof call[0] === 'string' && (call[0] as string).endsWith('.env.firestore.example')
      );
      const content = envCall?.[1] as string;
      expect(content).toContain('GCLOUD_PROJECT');
      expect(content).toContain('GOOGLE_APPLICATION_CREDENTIALS');
      expect(content).toContain('AGENTGUARD_STORE=firestore');
    });

    it('should return 1 if firestore.rules already exists', async () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        return String(p).endsWith('firestore.rules');
      });
      const code = await init(['firestore']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalled();
    });

    it('should write to custom directory when --dir is provided', async () => {
      await init(['firestore', '--dir', '/tmp/my-firestore']);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const rulesCall = writeCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('my-firestore')
      );
      expect(rulesCall).toBeDefined();
    });

    it('should print GCP setup instructions', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await init(['firestore']);

      const allOutput = consoleSpy.mock.calls.flat().join('\n');
      expect(allOutput).toContain('gcloud iam service-accounts create');
      expect(allOutput).toContain('roles/datastore.user');
      expect(allOutput).toContain('firebase deploy');
    });
  });

  describe('policy templates', () => {
    const MOCK_TEMPLATE = `# Mock template\nid: mock-policy\nrules: []\n`;

    function setupTemplateMocks() {
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        // The templates directory must exist (for resolveTemplatesDir)
        if (path.endsWith('templates')) return true;
        // The template YAML file must exist
        if (path.endsWith('.yaml') && path.includes('templates')) return true;
        // The output agentguard.yaml must NOT exist
        if (path.endsWith('agentguard.yaml')) return false;
        return false;
      });
      vi.mocked(readFileSync).mockReturnValue(MOCK_TEMPLATE);
    }

    it('should scaffold a template when --template is provided', async () => {
      setupTemplateMocks();
      const code = await init(['--template', 'strict']);
      expect(code).toBe(0);
      expect(writeFileSync).toHaveBeenCalled();

      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const yamlCall = writeCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).endsWith('agentguard.yaml')
      );
      expect(yamlCall).toBeDefined();
      expect(yamlCall?.[1]).toBe(MOCK_TEMPLATE);
    });

    it('should accept -t alias for --template', async () => {
      setupTemplateMocks();
      const code = await init(['-t', 'development']);
      expect(code).toBe(0);
    });

    it('should accept all four template names', async () => {
      const templates = ['strict', 'permissive', 'ci-only', 'development'];
      for (const tmpl of templates) {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        setupTemplateMocks();

        const code = await init(['--template', tmpl]);
        expect(code, `Template "${tmpl}" should be valid`).toBe(0);
      }
    });

    it('should return 1 for unknown template name', async () => {
      const code = await init(['--template', 'nonexistent']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalled();
    });

    it('should return 1 if agentguard.yaml already exists', async () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('templates')) return true;
        if (path.endsWith('.yaml') && path.includes('templates')) return true;
        // Output file already exists
        if (path.endsWith('agentguard.yaml')) return true;
        return false;
      });
      vi.mocked(readFileSync).mockReturnValue(MOCK_TEMPLATE);

      const code = await init(['--template', 'strict']);
      expect(code).toBe(1);
      expect(console.error).toHaveBeenCalled();
    });

    it('should write to custom directory when --dir is provided', async () => {
      setupTemplateMocks();
      const code = await init(['--template', 'permissive', '--dir', '/tmp/my-project']);
      expect(code).toBe(0);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const yamlCall = writeCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('my-project')
      );
      expect(yamlCall).toBeDefined();
    });

    it('should display success message with template name', async () => {
      setupTemplateMocks();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await init(['--template', 'development']);

      const allOutput = consoleSpy.mock.calls.flat().join('\n');
      expect(allOutput).toContain('development');
    });

    it('should include template info in help output', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await init([]);

      const allOutput = consoleSpy.mock.calls.flat().join('\n');
      expect(allOutput).toContain('--template');
      expect(allOutput).toContain('strict');
      expect(allOutput).toContain('permissive');
      expect(allOutput).toContain('ci-only');
      expect(allOutput).toContain('development');
    });
  });
});
