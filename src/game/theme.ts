// BugMon Design System — premium dark idle dungeon aesthetic
// Deep OLED darks, gold accents, glassmorphic panels, DM Sans typography

export const CANVAS_W = 480;
export const CANVAS_H = 320;
export const TILE = 32;

// ── Core palette — premium dark + gold ───────────────────────────────────
export const Color = {
  // Backgrounds (deep → surface)
  bgDeep: '#050510',
  bgPrimary: '#0A0E27',
  bgSurface: '#151B38',
  bgFloor: '#111730',

  // Text
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#475569',
  textDisabled: 'rgba(255,255,255,0.25)',

  // Gold accents (treasure, highlights, premium feel)
  gold: '#F59E0B',
  goldDim: '#CA8A04',
  goldGlow: 'rgba(245,158,11,0.4)',
  goldBright: '#FCD34D',

  // Action accents
  accentCyan: '#06B6D4',
  accentPurple: '#8B5CF6',
  accentRose: '#F43F5E',

  // Status
  hpHigh: '#22C55E',
  hpMid: '#F59E0B',
  hpLow: '#EF4444',
  xpFill: '#8B5CF6',

  // Glass panels
  glassBg: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.1)',
  glassHighlight: 'rgba(255,255,255,0.12)',

  // Floor glow
  floorEdge: 'rgba(6,182,212,0.25)',
  floorGrid: 'rgba(6,182,212,0.06)',
} as const;

// ── Type colors ──────────────────────────────────────────────────────────
export const TypeColor: Record<string, string> = {
  frontend: '#3B82F6',
  backend: '#EF4444',
  devops: '#22C55E',
  testing: '#F59E0B',
  architecture: '#8B5CF6',
  security: '#14B8A6',
  ai: '#06B6D4',
};

// ── Typography — DM Sans (clean, modern, beautiful at all sizes) ─────────
const FONT = "'DM Sans', sans-serif";

export const Font = {
  title: `700 28px ${FONT}`,
  heading: `600 20px ${FONT}`,
  body: `400 16px ${FONT}`,
  bodyBold: `600 16px ${FONT}`,
  small: `400 13px ${FONT}`,
  label: `500 11px ${FONT}`,
  labelBold: `700 11px ${FONT}`,
  number: `700 20px ${FONT}`,
  family: FONT,
} as const;

// ── Spacing ──────────────────────────────────────────────────────────────
export const Space = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  hudPad: 10,
  panelRadius: 8,
  hudHeight: 28,
  menuHeight: 80,
} as const;

// ── Animation timing (ms) ────────────────────────────────────────────────
export const Timing = {
  fast: 150,
  medium: 300,
  smooth: 500,
  slow: 800,
  encounter: 600,
  lootFloat: 1000,
  particleFade: 2000,
  messageDuration: 2000,
  floorTransition: 1200,
} as const;

// ── Dungeon constants ────────────────────────────────────────────────────
export const Dungeon = {
  floorY: 240, // y-position of the floor surface
  playerScreenX: 120, // character stays at this x
  runSpeed: 70, // pixels per second
  spriteSize: 48, // character/enemy sprite size
  corridorMinW: 200,
  corridorMaxW: 350,
  enemyRoomW: 250,
  treasureRoomW: 200,
  bossRoomW: 400,
  exitRoomW: 150,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────

export function hpColor(current: number, max: number): string {
  const pct = current / max;
  if (pct > 0.5) return Color.hpHigh;
  if (pct > 0.2) return Color.hpMid;
  return Color.hpLow;
}

export function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

export function clearGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

export function glassPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = Space.panelRadius
): void {
  ctx.fillStyle = Color.glassBg;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = Color.glassBorder;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
