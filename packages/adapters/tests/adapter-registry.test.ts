import { describe, it, expect } from 'vitest';
import { createLiveRegistry, createDryRunRegistry } from '@red-codes/adapters';

describe('adapter registry', () => {
  describe('createLiveRegistry', () => {
    it('returns a registry with file, shell, and git adapters', () => {
      const registry = createLiveRegistry();
      expect(registry.has('file')).toBe(true);
      expect(registry.has('shell')).toBe(true);
      expect(registry.has('git')).toBe(true);
    });

    it('lists all registered action classes', () => {
      const registry = createLiveRegistry();
      const registered = registry.listRegistered();
      expect(registered).toContain('file');
      expect(registered).toContain('shell');
      expect(registered).toContain('git');
    });

    it('returns false for unregistered class', () => {
      const registry = createLiveRegistry();
      expect(registry.has('http')).toBe(false);
    });
  });

  describe('createDryRunRegistry', () => {
    it('is exported and callable', () => {
      expect(typeof createDryRunRegistry).toBe('function');
      const registry = createDryRunRegistry();
      expect(registry).toBeDefined();
    });
  });
});
