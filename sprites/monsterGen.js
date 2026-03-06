// Procedural monster sprite generator
// Generates unique pixel-art monsters from a seed + color

const monsterCache = new Map();

// Seeded RNG (mulberry32)
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

function darken(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r - amount | 0, g - amount | 0, b - amount | 0);
}

function lighten(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + amount | 0, g + amount | 0, b + amount | 0);
}

/**
 * Generate a procedural monster on a canvas.
 * Uses the monster's id as seed so each monster is unique but deterministic.
 */
export function generateMonster(monsterId, color, size) {
  const key = `${monsterId}_${color}_${size}`;
  if (monsterCache.has(key)) return monsterCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const rand = mulberry32(monsterId * 7919 + 31);
  const px = size / 10; // pixel size in the 10x10 grid

  // Colors
  const baseColor = color;
  const darkColor = darken(color, 40);
  const lightColor = lighten(color, 50);
  const bellyColor = lighten(color, 80);

  // Generate body shape on a 5x10 grid (left half), then mirror
  // Row 0 is top, row 9 is bottom
  const grid = [];
  for (let y = 0; y < 10; y++) {
    grid[y] = [];
    for (let x = 0; x < 5; x++) {
      grid[y][x] = 0; // 0=empty, 1=body, 2=dark, 3=light/belly
    }
  }

  // Determine body bounds - create a blobby shape
  const bodyTop = 1 + Math.floor(rand() * 2);    // 1-2
  const bodyBottom = 7 + Math.floor(rand() * 2);  // 7-8
  const bodyLeft = Math.floor(rand() * 2);         // 0-1
  const widest = 4 + Math.floor(rand() * 1);       // 4
  const headNarrow = 1 + Math.floor(rand() * 2);   // head is narrower

  for (let y = bodyTop; y <= bodyBottom; y++) {
    // How wide is this row?
    const progress = (y - bodyTop) / (bodyBottom - bodyTop); // 0 to 1
    let rowWidth;
    if (progress < 0.3) {
      // Head region - narrower
      rowWidth = widest - headNarrow + Math.floor(progress / 0.3 * headNarrow);
    } else if (progress < 0.7) {
      // Body region - widest
      rowWidth = widest;
    } else {
      // Legs/bottom - might taper or have legs
      rowWidth = widest - Math.floor((progress - 0.7) / 0.3 * 1.5);
    }
    rowWidth = Math.max(2, Math.min(5, rowWidth));
    const startX = bodyLeft;
    for (let x = startX; x < startX + rowWidth && x < 5; x++) {
      grid[y][x] = 1;
    }
  }

  // Add some random bumps/horns on top
  const hasHorns = rand() > 0.4;
  if (hasHorns) {
    const hornX = 1 + Math.floor(rand() * 3);
    if (bodyTop > 0) {
      grid[bodyTop - 1][Math.min(hornX, 4)] = 1;
      if (rand() > 0.5 && bodyTop > 1) {
        grid[bodyTop - 2][Math.min(hornX, 4)] = 1;
      }
    }
  }

  // Add feet/legs at bottom
  const hasLegs = rand() > 0.3;
  if (hasLegs && bodyBottom < 9) {
    const legRow = bodyBottom + 1;
    grid[legRow][bodyLeft] = 2;
    grid[legRow][Math.min(bodyLeft + 2 + Math.floor(rand() * 2), 4)] = 2;
  }

  // Add arms/wings
  const hasArms = rand() > 0.3;
  if (hasArms) {
    const armY = bodyTop + 2 + Math.floor(rand() * 2);
    if (armY <= bodyBottom) {
      // Extend outward - on the edge
      for (let x = 0; x < 5; x++) {
        if (grid[armY][x] === 1) {
          // Find the rightmost body pixel
        }
      }
      // Just add a pixel beyond the body edge
      let edgeX = 4;
      for (let x = 4; x >= 0; x--) {
        if (grid[armY][x] === 1) { edgeX = x; break; }
      }
      if (edgeX < 4) {
        grid[armY][edgeX + 1] = 2;
      }
    }
  }

  // Add belly markings
  const hasBelly = rand() > 0.4;
  if (hasBelly) {
    const bellyY = bodyTop + Math.floor((bodyBottom - bodyTop) * 0.5);
    for (let y = bellyY; y <= Math.min(bellyY + 2, bodyBottom); y++) {
      for (let x = bodyLeft + 1; x < bodyLeft + 3 && x < 5; x++) {
        if (grid[y][x] === 1) grid[y][x] = 3;
      }
    }
  }

  // Now draw the grid (mirrored for symmetry)
  const colorMap = {
    1: baseColor,
    2: darkColor,
    3: bellyColor
  };

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 5; x++) {
      const cell = grid[y][x];
      if (cell === 0) continue;
      ctx.fillStyle = colorMap[cell];
      // Left side
      ctx.fillRect(x * px, y * px, px + 0.5, px + 0.5);
      // Mirrored right side
      ctx.fillRect((9 - x) * px, y * px, px + 0.5, px + 0.5);
    }
  }

  // Draw outline for definition
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const srcX = x < 5 ? x : 9 - x;
      if (grid[y][srcX] === 0) continue;
      // Check neighbors for outline
      const neighbors = [
        [0, -1], [0, 1], [-1, 0], [1, 0]
      ];
      for (const [dx, dy] of neighbors) {
        const nx = x + dx, ny = y + dy;
        const nSrcX = nx < 5 ? nx : 9 - nx;
        if (nx < 0 || nx >= 10 || ny < 0 || ny >= 10 || grid[ny]?.[nSrcX] === 0 || nSrcX < 0 || nSrcX >= 5) {
          // Draw outline edge
          const ex = dx === -1 ? x * px : dx === 1 ? (x + 1) * px : x * px;
          const ey = dy === -1 ? y * px : dy === 1 ? (y + 1) * px : y * px;
          const ew = dx !== 0 ? 0.5 : px;
          const eh = dy !== 0 ? 0.5 : px;
          ctx.fillStyle = darkColor;
          ctx.fillRect(ex, ey, ew || 1, eh || 1);
        }
      }
    }
  }

  // Draw eyes
  const eyeY = bodyTop + 1 + Math.floor(rand() * 1);
  const eyeSize = rand() > 0.5 ? 2 : 1.5;
  const pupilStyle = Math.floor(rand() * 3); // 0=center, 1=left, 2=angry

  // Left eye
  const eyeLX = (2) * px + px * 0.2;
  const eyeRX = (7) * px + px * 0.2;
  const eyeYPos = eyeY * px + px * 0.2;
  const eyeW = px * eyeSize * 0.6;
  const eyeH = px * eyeSize * 0.6;

  // Eye whites
  ctx.fillStyle = '#fff';
  ctx.fillRect(eyeLX, eyeYPos, eyeW, eyeH);
  ctx.fillRect(eyeRX, eyeYPos, eyeW, eyeH);

  // Pupils
  ctx.fillStyle = '#111';
  const pupilSize = eyeW * 0.5;
  const pupilOffX = pupilStyle === 1 ? 0 : (eyeW - pupilSize) / 2;
  const pupilOffY = pupilStyle === 2 ? 0 : (eyeH - pupilSize) / 2;
  ctx.fillRect(eyeLX + pupilOffX, eyeYPos + pupilOffY, pupilSize, pupilSize);
  ctx.fillRect(eyeRX + pupilOffX, eyeYPos + pupilOffY, pupilSize, pupilSize);

  // Maybe add a mouth
  const hasMouth = rand() > 0.3;
  if (hasMouth) {
    const mouthY = eyeY + 2;
    if (mouthY <= bodyBottom) {
      ctx.fillStyle = darkColor;
      const mouthWidth = 1 + Math.floor(rand() * 3);
      const mouthX = 5 - mouthWidth / 2;
      ctx.fillRect(mouthX * px, mouthY * px + px * 0.3, mouthWidth * px, px * 0.4);

      // Teeth
      if (rand() > 0.5) {
        ctx.fillStyle = '#fff';
        const toothW = px * 0.3;
        ctx.fillRect(mouthX * px + px * 0.2, mouthY * px + px * 0.3, toothW, px * 0.25);
        ctx.fillRect((mouthX + mouthWidth) * px - px * 0.5, mouthY * px + px * 0.3, toothW, px * 0.25);
      }
    }
  }

  monsterCache.set(key, canvas);
  return canvas;
}

/**
 * Generate a colored egg sprite for wild (unhatched) monsters.
 * Each egg is unique based on monster id - different spot patterns, crack styles.
 */
export function generateEgg(monsterId, color, size) {
  const key = `egg_${monsterId}_${color}_${size}`;
  if (monsterCache.has(key)) return monsterCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const rand = mulberry32(monsterId * 3571 + 17);
  const cx = size / 2;
  const cy = size / 2 + size * 0.05; // slightly lower center
  const rx = size * 0.3;  // horizontal radius
  const ryTop = size * 0.4;  // taller on top
  const ryBot = size * 0.32; // rounder on bottom

  const baseColor = color;
  const darkColor = darken(color, 50);
  const lightColor = lighten(color, 60);
  const shellLight = lighten(color, 30);

  // Draw egg shape (oval, narrower at top)
  ctx.beginPath();
  // Top half (narrower)
  ctx.ellipse(cx, cy, rx, ryTop, 0, Math.PI, 0, false);
  // Bottom half (wider)
  ctx.ellipse(cx, cy, rx * 1.1, ryBot, 0, 0, Math.PI, false);
  ctx.closePath();

  // Gradient fill
  const grad = ctx.createRadialGradient(
    cx - rx * 0.3, cy - ryTop * 0.3, 2,
    cx, cy, rx * 1.2
  );
  grad.addColorStop(0, lightColor);
  grad.addColorStop(0.5, baseColor);
  grad.addColorStop(1, darkColor);
  ctx.fillStyle = grad;
  ctx.fill();

  // Outline
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Spots/markings (unique per monster)
  const spotCount = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < spotCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * 0.5 + 0.2;
    const spotX = cx + Math.cos(angle) * rx * dist;
    const spotY = cy + Math.sin(angle) * ryBot * dist * 0.8;
    const spotR = size * (0.02 + rand() * 0.04);

    ctx.beginPath();
    ctx.arc(spotX, spotY, spotR, 0, Math.PI * 2);
    ctx.fillStyle = rand() > 0.5 ? shellLight : darkColor;
    ctx.fill();
  }

  // Cracks (subtle, like it's about to hatch)
  const hasCracks = rand() > 0.4;
  if (hasCracks) {
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const crackStartX = cx + (rand() - 0.5) * rx * 0.8;
    const crackStartY = cy - ryTop * 0.1;
    ctx.moveTo(crackStartX, crackStartY);
    const segments = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < segments; i++) {
      const dx = (rand() - 0.5) * size * 0.12;
      const dy = rand() * size * 0.08;
      ctx.lineTo(crackStartX + dx * (i + 1) * 0.5, crackStartY + dy * (i + 1));
    }
    ctx.stroke();
  }

  // Highlight/shine
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.25, cy - ryTop * 0.35, size * 0.04, size * 0.07, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();

  // Subtle wobble shadow at bottom
  ctx.beginPath();
  ctx.ellipse(cx, cy + ryBot + 2, rx * 0.8, size * 0.03, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();

  monsterCache.set(key, canvas);
  return canvas;
}
