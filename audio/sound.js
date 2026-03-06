// Web Audio API sound effects - all sounds synthesized, no files needed

let ctx = null;
let masterGain = null;
let muted = false;
let volume = 0.5;

function initContext() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);
    return true;
  } catch (e) {
    return false;
  }
}

function ensureContext() {
  if (!initContext()) return false;
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

export function unlock() {
  if (!initContext()) return;
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  if (!ctx) return false;
  muted = !muted;
  masterGain.gain.value = muted ? 0 : volume;
  return muted;
}

// --- Synthesis primitives ---
// Use osc.start() with no args (starts immediately) and direct gain.value
// to avoid AudioContext timing issues with suspended contexts.

function playTone(freq, duration, type, vol) {
  if (!ensureContext()) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.value = vol !== undefined ? vol : 0.3;
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* ignore audio errors */ }
}

function playToneFade(freq, duration, type, vol) {
  if (!ensureContext()) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const v = vol !== undefined ? vol : 0.3;
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.value = v;
    osc.connect(g);
    g.connect(masterGain);
    const t = ctx.currentTime;
    osc.start();
    g.gain.setValueAtTime(v, t);
    g.gain.linearRampToValueAtTime(0.001, t + duration);
    osc.stop(t + duration + 0.05);
  } catch (e) { /* ignore audio errors */ }
}

function playSweep(startFreq, endFreq, duration, type, vol) {
  if (!ensureContext()) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const v = vol !== undefined ? vol : 0.3;
    osc.type = type || 'sine';
    g.gain.value = v;
    osc.connect(g);
    g.connect(masterGain);
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + duration);
    g.gain.setValueAtTime(v, t);
    g.gain.linearRampToValueAtTime(0.001, t + duration);
    osc.start();
    osc.stop(t + duration + 0.05);
  } catch (e) { /* ignore audio errors */ }
}

function playNoise(duration, vol) {
  if (!ensureContext()) return;
  try {
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = vol !== undefined ? vol : 0.2;
    source.connect(g);
    g.connect(masterGain);
    source.start();
    source.stop(ctx.currentTime + duration + 0.05);
  } catch (e) { /* ignore audio errors */ }
}

function playToneDelayed(freq, duration, type, vol, delayMs, fade) {
  setTimeout(() => {
    if (fade) {
      playToneFade(freq, duration, type, vol);
    } else {
      playTone(freq, duration, type, vol);
    }
  }, delayMs);
}

// --- Sound effects ---

export function playMenuNav() {
  playTone(880, 0.06, 'square', 0.3);
}

export function playMenuConfirm() {
  playTone(880, 0.07, 'square', 0.3);
  playToneDelayed(1320, 0.09, 'square', 0.3, 70, true);
}

export function playMenuCancel() {
  playSweep(440, 220, 0.12, 'square', 0.3);
}

export function playFootstep() {
  playToneFade(200, 0.06, 'triangle', 0.15);
}

export function playEncounterAlert() {
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    playToneDelayed(freq, 0.1, 'square', 0.35, i * 100, true);
  });
}

export function playTransitionFlash() {
  playNoise(0.08, 0.25);
}

export function playAttack() {
  playNoise(0.1, 0.3);
  playSweep(800, 200, 0.18, 'sawtooth', 0.3);
}

export function playFaint() {
  playSweep(600, 100, 0.5, 'triangle', 0.3);
}

export function playCaptureSuccess() {
  const notes = [523, 659, 784, 1047, 1319]; // C5, E5, G5, C6, E6
  notes.forEach((freq, i) => {
    const dur = i === notes.length - 1 ? 0.25 : 0.12;
    playToneDelayed(freq, dur, 'sine', 0.35, i * 120, true);
  });
}

export function playCaptureFailure() {
  playSweep(400, 800, 0.12, 'sine', 0.3);
  playToneDelayed(600, 0.2, 'sine', 0.25, 130, true);
}

export function playBattleVictory() {
  const notes = [262, 330, 392, 523, 659]; // C4, E4, G4, C5, E5
  notes.forEach((freq, i) => {
    const dur = i === notes.length - 1 ? 0.35 : 0.14;
    playToneDelayed(freq, dur, 'sine', 0.35, i * 140, true);
  });
}
