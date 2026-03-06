// Battle transition - flash and fade effect when entering encounters
import { playTransitionFlash } from '../audio/sound.js';

let transition = null;

function hexToRgb(hex) {
  const n = parseInt((hex || '#ffffff').replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function buildPhases(flashRgb) {
  const flashColor = `rgba(${flashRgb},`;
  return [
    { type: 'flash', duration: 60, color: flashColor },
    { type: 'pause', duration: 80 },
    { type: 'flash', duration: 60, color: flashColor },
    { type: 'pause', duration: 80 },
    { type: 'flash', duration: 80, color: flashColor },
    { type: 'fade',  duration: 300, color: 'rgba(0,0,0,' },
    { type: 'hold',  duration: 200 },
  ];
}

export function startTransition(wildMon) {
  const rgb = hexToRgb(wildMon.color);
  transition = {
    wildMon,
    phases: buildPhases(rgb),
    phase: 0,
    timer: 0,
    totalTime: 0,
    done: false
  };
  playTransitionFlash();
}

export function updateTransition(dt) {
  if (!transition || transition.done) return null;

  transition.timer += dt;
  const phases = transition.phases;
  const phase = phases[transition.phase];

  if (transition.timer >= phase.duration) {
    transition.timer = 0;
    transition.phase++;

    if (transition.phase < phases.length && phases[transition.phase].type === 'flash') {
      playTransitionFlash();
    }

    if (transition.phase >= phases.length) {
      transition.done = true;
      const mon = transition.wildMon;
      transition = null;
      return mon; // signal to start the battle
    }
  }

  return null; // still transitioning
}

export function getTransition() {
  return transition;
}

export function drawTransitionOverlay(ctx, width, height, mapDrawFn) {
  if (!transition) return;

  // Always draw the map underneath during transition
  mapDrawFn();

  const phase = transition.phases[transition.phase];
  const progress = transition.timer / phase.duration;

  if (phase.type === 'flash') {
    // Quick white flash: ramp up then down
    const intensity = progress < 0.5
      ? progress * 2
      : (1 - progress) * 2;
    ctx.fillStyle = phase.color + (intensity * 0.9).toFixed(2) + ')';
    ctx.fillRect(0, 0, width, height);
  } else if (phase.type === 'fade') {
    // Fade to black
    ctx.fillStyle = phase.color + progress.toFixed(2) + ')';
    ctx.fillRect(0, 0, width, height);
  } else if (phase.type === 'hold') {
    // Solid black
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, width, height);
  }
  // 'pause' type: just show the map, no overlay
}
