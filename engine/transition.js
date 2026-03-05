// Battle transition - flash and fade effect when entering encounters

let transition = null;

// Timeline: 3 quick white flashes, then fade to black, then start battle
const PHASES = [
  { type: 'flash', duration: 60, color: 'rgba(255,255,255,' },
  { type: 'pause', duration: 80 },
  { type: 'flash', duration: 60, color: 'rgba(255,255,255,' },
  { type: 'pause', duration: 80 },
  { type: 'flash', duration: 80, color: 'rgba(255,255,255,' },
  { type: 'fade',  duration: 300, color: 'rgba(0,0,0,' },
  { type: 'hold',  duration: 200 },
];

export function startTransition(wildMon) {
  transition = {
    wildMon,
    phase: 0,
    timer: 0,
    totalTime: 0,
    done: false
  };
}

export function updateTransition(dt) {
  if (!transition || transition.done) return null;

  transition.timer += dt;
  const phase = PHASES[transition.phase];

  if (transition.timer >= phase.duration) {
    transition.timer = 0;
    transition.phase++;

    if (transition.phase >= PHASES.length) {
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

  const phase = PHASES[transition.phase];
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
