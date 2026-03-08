import assert from 'node:assert';
import { test, suite } from './run.js';

// Save existing AudioContext mock state
const _originalAudioContext = globalThis.AudioContext;
const _originalWindow = globalThis.window;

// Full AudioContext mock for testing sound.js
function createMockAudioContext() {
  return class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = {};
    }
    resume() { this.state = 'running'; }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { value: 440, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
      };
    }
    createBuffer(channels, length, _sampleRate) {
      return {
        getChannelData() { return new Float32Array(length); },
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start() {},
        stop() {},
      };
    }
  };
}

// Set up mocks before importing
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener() {} };
}
globalThis.window.AudioContext = createMockAudioContext();
globalThis.window.webkitAudioContext = undefined;
globalThis.AudioContext = createMockAudioContext();

const {
  unlock, toggleMute,
  playMenuNav, playMenuConfirm, playMenuCancel, playFootstep,
  playEncounterAlert, playTransitionFlash, playAttack, playFaint,
  playCaptureSuccess, playCaptureFailure, playBattleVictory, playEvolution,
} = await import('../dist/game/audio/sound.js');

suite('Audio system (game/audio/sound.js)', () => {
  test('unlock does not throw', () => {
    assert.doesNotThrow(() => unlock());
  });

  test('toggleMute returns boolean', () => {
    // Initialize audio first
    unlock();
    const result = toggleMute();
    assert.ok(typeof result === 'boolean');
  });

  test('toggleMute toggles state', () => {
    unlock();
    const first = toggleMute();
    const second = toggleMute();
    assert.notStrictEqual(first, second);
  });

  test('playMenuNav does not throw', () => {
    assert.doesNotThrow(() => playMenuNav());
  });

  test('playMenuConfirm does not throw', () => {
    assert.doesNotThrow(() => playMenuConfirm());
  });

  test('playMenuCancel does not throw', () => {
    assert.doesNotThrow(() => playMenuCancel());
  });

  test('playFootstep does not throw', () => {
    assert.doesNotThrow(() => playFootstep());
  });

  test('playEncounterAlert does not throw', () => {
    assert.doesNotThrow(() => playEncounterAlert());
  });

  test('playTransitionFlash does not throw', () => {
    assert.doesNotThrow(() => playTransitionFlash());
  });

  test('playAttack does not throw', () => {
    assert.doesNotThrow(() => playAttack());
  });

  test('playFaint does not throw', () => {
    assert.doesNotThrow(() => playFaint());
  });

  test('playCaptureSuccess does not throw', () => {
    assert.doesNotThrow(() => playCaptureSuccess());
  });

  test('playCaptureFailure does not throw', () => {
    assert.doesNotThrow(() => playCaptureFailure());
  });

  test('playBattleVictory does not throw', () => {
    assert.doesNotThrow(() => playBattleVictory());
  });

  test('playEvolution does not throw', () => {
    assert.doesNotThrow(() => playEvolution());
  });
});
