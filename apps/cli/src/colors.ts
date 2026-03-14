// Shared ANSI color constants for CLI output
// Respects NO_COLOR convention (https://no-color.org/)

const enabled = !process.env.NO_COLOR;

const ESC = '\x1b[';
export const RESET = enabled ? `${ESC}0m` : '';
export const BOLD = enabled ? `${ESC}1m` : '';
export const DIM = enabled ? `${ESC}2m` : '';

export const FG: Record<string, string> = {
  black: enabled ? `${ESC}30m` : '',
  red: enabled ? `${ESC}31m` : '',
  green: enabled ? `${ESC}32m` : '',
  yellow: enabled ? `${ESC}33m` : '',
  blue: enabled ? `${ESC}34m` : '',
  magenta: enabled ? `${ESC}35m` : '',
  cyan: enabled ? `${ESC}36m` : '',
  white: enabled ? `${ESC}37m` : '',
  gray: enabled ? `${ESC}90m` : '',
};

export const TYPE_COLORS: Record<string, string> = {
  frontend: 'blue',
  backend: 'red',
  devops: 'yellow',
  testing: 'green',
  architecture: 'magenta',
  security: 'red',
  ai: 'cyan',
};

export function color(text: string, fg: string): string {
  return `${FG[fg] || ''}${text}${RESET}`;
}

export function bold(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

export function dim(text: string): string {
  return `${DIM}${text}${RESET}`;
}

export function visLen(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function padVis(str: string, width: number): string {
  const diff = width - visLen(str);
  return diff > 0 ? str + ' '.repeat(diff) : str;
}
