import { describe, it, expect } from 'vitest';
import {
  normalizeIntent,
  authorize,
  detectGitAction,
  isDestructiveCommand,
  getDestructiveDetails,
  DESTRUCTIVE_PATTERNS,
} from '../../src/kernel/aab.js';
import type { RawAgentAction as _RawAgentAction } from '../../src/kernel/aab.js';

describe('agentguard/core/aab', () => {
  describe('detectGitAction', () => {
    it('detects git push', () => {
      expect(detectGitAction('git push origin main')).toBe('git.push');
    });

    it('detects git force push', () => {
      expect(detectGitAction('git push --force origin main')).toBe('git.force-push');
      expect(detectGitAction('git push -f origin main')).toBe('git.force-push');
    });

    it('detects git branch delete', () => {
      expect(detectGitAction('git branch -d feature')).toBe('git.branch.delete');
      expect(detectGitAction('git branch -D feature')).toBe('git.branch.delete');
    });

    it('detects git merge', () => {
      expect(detectGitAction('git merge feature')).toBe('git.merge');
    });

    it('detects git commit', () => {
      expect(detectGitAction('git commit -m "msg"')).toBe('git.commit');
    });

    it('returns null for non-git commands', () => {
      expect(detectGitAction('npm install')).toBeNull();
      expect(detectGitAction('')).toBeNull();
    });
  });

  describe('DESTRUCTIVE_PATTERNS', () => {
    it('has at least 30 patterns', () => {
      expect(DESTRUCTIVE_PATTERNS.length).toBeGreaterThanOrEqual(30);
    });

    it('every pattern has required fields', () => {
      for (const p of DESTRUCTIVE_PATTERNS) {
        expect(p.pattern).toBeInstanceOf(RegExp);
        expect(p.description).toBeTruthy();
        expect(['high', 'critical']).toContain(p.riskLevel);
        expect(p.category).toBeTruthy();
      }
    });

    it('covers all expected categories', () => {
      const categories = new Set(DESTRUCTIVE_PATTERNS.map((p) => p.category));
      expect(categories).toContain('filesystem');
      expect(categories).toContain('system');
      expect(categories).toContain('process');
      expect(categories).toContain('container');
      expect(categories).toContain('service');
      expect(categories).toContain('database');
      expect(categories).toContain('package');
      expect(categories).toContain('network');
    });
  });

  describe('isDestructiveCommand', () => {
    // Original patterns
    it('detects rm -rf', () => {
      expect(isDestructiveCommand('rm -rf /')).toBe(true);
    });

    it('detects rm -r', () => {
      expect(isDestructiveCommand('rm -r /tmp/mydir')).toBe(true);
    });

    it('detects rm --recursive', () => {
      expect(isDestructiveCommand('rm --recursive /tmp/mydir')).toBe(true);
    });

    it('detects chmod 777', () => {
      expect(isDestructiveCommand('chmod 777 /var/www')).toBe(true);
    });

    it('detects dd if=', () => {
      expect(isDestructiveCommand('dd if=/dev/zero of=/dev/sda')).toBe(true);
    });

    it('detects mkfs', () => {
      expect(isDestructiveCommand('mkfs.ext4 /dev/sda1')).toBe(true);
    });

    it('detects device writes', () => {
      expect(isDestructiveCommand('echo data > /dev/sda')).toBe(true);
    });

    it('detects sudo rm', () => {
      expect(isDestructiveCommand('sudo rm -rf /var/log')).toBe(true);
    });

    it('detects dropdb', () => {
      expect(isDestructiveCommand('dropdb mydb')).toBe(true);
    });

    it('detects DROP DATABASE', () => {
      expect(isDestructiveCommand('DROP DATABASE mydb')).toBe(true);
      expect(isDestructiveCommand('drop database mydb')).toBe(true);
    });

    it('detects DROP TABLE', () => {
      expect(isDestructiveCommand('DROP TABLE users')).toBe(true);
      expect(isDestructiveCommand('drop table users')).toBe(true);
    });

    // New filesystem patterns
    it('detects shred', () => {
      expect(isDestructiveCommand('shred -vfz /tmp/secret.txt')).toBe(true);
    });

    it('detects fdisk', () => {
      expect(isDestructiveCommand('fdisk /dev/sda')).toBe(true);
    });

    // New system administration patterns
    it('detects sudo (general)', () => {
      expect(isDestructiveCommand('sudo apt update')).toBe(true);
    });

    it('detects su', () => {
      expect(isDestructiveCommand('su - root')).toBe(true);
      expect(isDestructiveCommand('su root')).toBe(true);
    });

    it('detects chown', () => {
      expect(isDestructiveCommand('chown root:root /etc/passwd')).toBe(true);
    });

    // New process management patterns
    it('detects kill -9', () => {
      expect(isDestructiveCommand('kill -9 1234')).toBe(true);
    });

    it('detects pkill', () => {
      expect(isDestructiveCommand('pkill -f node')).toBe(true);
    });

    it('detects killall', () => {
      expect(isDestructiveCommand('killall nginx')).toBe(true);
    });

    // New container operations patterns
    it('detects docker rm', () => {
      expect(isDestructiveCommand('docker rm my-container')).toBe(true);
    });

    it('detects docker rmi', () => {
      expect(isDestructiveCommand('docker rmi my-image:latest')).toBe(true);
    });

    it('detects docker system prune', () => {
      expect(isDestructiveCommand('docker system prune -af')).toBe(true);
    });

    // New service management patterns
    it('detects systemctl stop', () => {
      expect(isDestructiveCommand('systemctl stop nginx')).toBe(true);
    });

    it('detects systemctl disable', () => {
      expect(isDestructiveCommand('systemctl disable sshd')).toBe(true);
    });

    it('detects service stop', () => {
      expect(isDestructiveCommand('service nginx stop')).toBe(true);
    });

    // New database patterns
    it('detects TRUNCATE', () => {
      expect(isDestructiveCommand('TRUNCATE TABLE users')).toBe(true);
      expect(isDestructiveCommand('truncate table logs')).toBe(true);
    });

    it('detects DELETE FROM without WHERE', () => {
      expect(isDestructiveCommand('DELETE FROM users;')).toBe(true);
      expect(isDestructiveCommand('delete from logs')).toBe(true);
    });

    it('allows DELETE FROM with WHERE clause', () => {
      expect(isDestructiveCommand('DELETE FROM users WHERE id = 5')).toBe(false);
    });

    // New package management patterns
    it('detects apt remove', () => {
      expect(isDestructiveCommand('apt remove nginx')).toBe(true);
    });

    it('detects apt purge', () => {
      expect(isDestructiveCommand('apt purge nginx')).toBe(true);
    });

    it('detects npm uninstall -g', () => {
      expect(isDestructiveCommand('npm uninstall -g typescript')).toBe(true);
    });

    it('detects pip uninstall', () => {
      expect(isDestructiveCommand('pip uninstall requests')).toBe(true);
    });

    // New network patterns
    it('detects iptables -F', () => {
      expect(isDestructiveCommand('iptables -F')).toBe(true);
    });

    it('detects ufw disable', () => {
      expect(isDestructiveCommand('ufw disable')).toBe(true);
    });

    // Safe commands
    it('returns false for safe commands', () => {
      expect(isDestructiveCommand('ls -la')).toBe(false);
      expect(isDestructiveCommand('npm test')).toBe(false);
      expect(isDestructiveCommand('git status')).toBe(false);
      expect(isDestructiveCommand('cat /etc/hosts')).toBe(false);
      expect(isDestructiveCommand('echo hello')).toBe(false);
      expect(isDestructiveCommand('docker ps')).toBe(false);
      expect(isDestructiveCommand('systemctl status nginx')).toBe(false);
      expect(isDestructiveCommand('npm install express')).toBe(false);
    });

    it('returns false for empty/null input', () => {
      expect(isDestructiveCommand('')).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(isDestructiveCommand(null as any)).toBe(false);
    });
  });

  describe('getDestructiveDetails', () => {
    it('returns pattern details for destructive commands', () => {
      const details = getDestructiveDetails('rm -rf /');
      expect(details).not.toBeNull();
      expect(details!.description).toBe('Recursive force delete');
      expect(details!.riskLevel).toBe('critical');
      expect(details!.category).toBe('filesystem');
    });

    it('returns null for safe commands', () => {
      expect(getDestructiveDetails('ls -la')).toBeNull();
      expect(getDestructiveDetails('npm test')).toBeNull();
    });

    it('returns null for empty/null input', () => {
      expect(getDestructiveDetails('')).toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getDestructiveDetails(null as any)).toBeNull();
    });

    it('returns correct category for each command type', () => {
      expect(getDestructiveDetails('docker rm ctr')!.category).toBe('container');
      expect(getDestructiveDetails('kill -9 123')!.category).toBe('process');
      expect(getDestructiveDetails('systemctl stop sshd')!.category).toBe('service');
      expect(getDestructiveDetails('DROP TABLE t')!.category).toBe('database');
      expect(getDestructiveDetails('apt remove pkg')!.category).toBe('package');
      expect(getDestructiveDetails('iptables -F')!.category).toBe('network');
      expect(getDestructiveDetails('sudo ls')!.category).toBe('system');
    });

    it('returns critical risk level for high-severity commands', () => {
      expect(getDestructiveDetails('rm -rf /')!.riskLevel).toBe('critical');
      expect(getDestructiveDetails('DROP DATABASE db')!.riskLevel).toBe('critical');
      expect(getDestructiveDetails('iptables -F')!.riskLevel).toBe('critical');
      expect(getDestructiveDetails('docker system prune')!.riskLevel).toBe('critical');
    });

    it('returns high risk level for moderate-severity commands', () => {
      expect(getDestructiveDetails('kill -9 1')!.riskLevel).toBe('high');
      expect(getDestructiveDetails('docker rm ctr')!.riskLevel).toBe('high');
      expect(getDestructiveDetails('systemctl stop svc')!.riskLevel).toBe('high');
      expect(getDestructiveDetails('pip uninstall pkg')!.riskLevel).toBe('high');
    });

    it('matches rm -rf even within sudo rm -rf', () => {
      // 'sudo rm -rf /' matches the 'rm -rf' pattern first (more specific)
      const details = getDestructiveDetails('sudo rm -rf /');
      expect(details!.description).toBe('Recursive force delete');
      expect(details!.riskLevel).toBe('critical');
      expect(details!.category).toBe('filesystem');
    });

    it('matches sudo rm for non-recursive sudo rm', () => {
      // 'sudo rm foo' matches the 'sudo rm' pattern
      const details = getDestructiveDetails('sudo rm foo.txt');
      expect(details!.description).toBe('Privileged file deletion');
      expect(details!.riskLevel).toBe('critical');
      expect(details!.category).toBe('system');
    });
  });

  describe('normalizeIntent', () => {
    it('normalizes a Write tool action', () => {
      const intent = normalizeIntent({ tool: 'Write', file: 'src/index.ts' });
      expect(intent.action).toBe('file.write');
      expect(intent.target).toBe('src/index.ts');
    });

    it('normalizes a Read tool action', () => {
      const intent = normalizeIntent({ tool: 'Read', file: 'src/index.ts' });
      expect(intent.action).toBe('file.read');
    });

    it('normalizes a Bash git push', () => {
      const intent = normalizeIntent({ tool: 'Bash', command: 'git push origin main' });
      expect(intent.action).toBe('git.push');
      expect(intent.target).toBe('main');
    });

    it('marks destructive shell commands', () => {
      const intent = normalizeIntent({ tool: 'Bash', command: 'rm -rf /' });
      expect(intent.destructive).toBe(true);
    });

    it('handles null input', () => {
      const intent = normalizeIntent(null);
      expect(intent.action).toBe('unknown');
    });
  });

  describe('authorize', () => {
    it('allows actions with no policies (open model)', () => {
      const result = authorize({ tool: 'Read', file: 'src/a.ts' }, []);
      expect(result.result.allowed).toBe(true);
      expect(result.events).toHaveLength(0);
    });

    it('denies destructive commands immediately', () => {
      const result = authorize({ tool: 'Bash', command: 'rm -rf /' }, []);
      expect(result.result.allowed).toBe(false);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('generates POLICY_DENIED events for policy violations', () => {
      const policies = [{
        id: 'no-write',
        name: 'No Write',
        rules: [{ action: 'file.write', effect: 'deny' as const, reason: 'Read-only' }],
        severity: 3,
      }];
      const result = authorize({ tool: 'Write', file: 'src/a.ts' }, policies);
      expect(result.result.allowed).toBe(false);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('checks blast radius limits', () => {
      const policies = [{
        id: 'limit-blast',
        name: 'Blast Limit',
        rules: [{ action: '*', effect: 'allow' as const, conditions: { limit: 5 } }],
        severity: 3,
      }];
      const result = authorize(
        { tool: 'Write', file: 'src/a.ts', filesAffected: 10 },
        policies,
      );
      // Should generate blast radius event (10 files * 1.5 write multiplier = 15 > limit 5)
      const blastEvent = result.events.find(e => e.kind === 'BlastRadiusExceeded');
      expect(blastEvent).toBeTruthy();
      // Should include blast radius computation result
      expect(result.blastRadius).toBeDefined();
      expect(result.blastRadius!.weightedScore).toBeGreaterThan(5);
      expect(result.blastRadius!.exceeded).toBe(true);
    });

    it('returns blastRadius result when policy has limits', () => {
      const policies = [{
        id: 'limit-blast',
        name: 'Blast Limit',
        rules: [{ action: '*', effect: 'allow' as const, conditions: { limit: 100 } }],
        severity: 3,
      }];
      const result = authorize(
        { tool: 'Read', file: 'src/a.ts', filesAffected: 1 },
        policies,
      );
      // Read action with 1 file: score = 1 * 0.1 = 0.1, should not exceed limit 100
      expect(result.blastRadius).toBeDefined();
      expect(result.blastRadius!.exceeded).toBe(false);
    });
  });
});
