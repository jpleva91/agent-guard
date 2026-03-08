/**
 * BugDex — Maps real JavaScript errors to BugMon encounters.
 *
 * Each entry maps an error pattern to a monster with:
 *   - name, type, ascii art, HP, rarity
 *   - XP reward for defeating it
 *   - The real error it represents
 */

export interface BugDexEntry {
  id: number;
  name: string;
  errorType: string;
  patterns: RegExp[];
  type: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  hp: number;
  xp: number;
  ascii: string[];
}

const BUGDEX: BugDexEntry[] = [
  // ── COMMON ──────────────────────────────────────────────
  {
    id: 1,
    name: 'NullPointerMon',
    errorType: 'TypeError',
    patterns: [/cannot read propert/i, /null/i, /undefined is not/i, /is not a function/i],
    type: 'memory',
    rarity: 'common',
    hp: 30,
    xp: 25,
    ascii: [
      '    ╭──────╮    ',
      '    │ ×  × │    ',
      '    │  __  │    ',
      '    ╰──┬┬──╯    ',
      '       ││       ',
      '    ╭──┘└──╮    ',
      '    │ NULL  │    ',
      '    ╰──────╯    ',
    ],
  },
  {
    id: 2,
    name: 'ParseDragon',
    errorType: 'SyntaxError',
    patterns: [/unexpected token/i, /unexpected end/i, /invalid or unexpected/i],
    type: 'syntax',
    rarity: 'common',
    hp: 28,
    xp: 20,
    ascii: [
      '       /\\_/\\     ',
      '    __/ o o \\__  ',
      '   /  \\  ^  /  \\ ',
      '  {  { }   { }  }',
      '   \\  \\_____/  / ',
      '    \\  ;\\ /;  /  ',
      '     \\  { }  /   ',
      '      \\_____/    ',
    ],
  },
  {
    id: 3,
    name: 'GhostVarMon',
    errorType: 'ReferenceError',
    patterns: [/is not defined/i, /cannot access.*before init/i],
    type: 'memory',
    rarity: 'common',
    hp: 24,
    xp: 20,
    ascii: [
      '     .--""--.    ',
      '    / .    . \\   ',
      '   | (o)  (o)|   ',
      '   |   ____   |  ',
      '    \\ |    | /   ',
      '     \\|    |/    ',
      "      `----'     ",
      '     ~ ~ ~ ~     ',
    ],
  },
  {
    id: 4,
    name: 'StackOverflow',
    errorType: 'RangeError',
    patterns: [/maximum call stack/i, /stack.?size/i, /too much recursion/i],
    type: 'runtime',
    rarity: 'common',
    hp: 35,
    xp: 30,
    ascii: [
      '    ╔════════╗   ',
      '    ║ ▓▓▓▓▓▓ ║   ',
      '    ╠════════╣   ',
      '    ║ ▓▓▓▓▓▓ ║   ',
      '    ╠════════╣   ',
      '    ║ ×    × ║   ',
      '    ║   ><   ║   ',
      '    ╚════════╝   ',
    ],
  },
  {
    id: 5,
    name: 'IndexOutOfBounds',
    errorType: 'RangeError',
    patterns: [/index/i, /out of range/i, /invalid array/i],
    type: 'memory',
    rarity: 'common',
    hp: 28,
    xp: 25,
    ascii: [
      '   [0][1][2][?]  ',
      '              ↗  ',
      '    ╭──────╮ /   ',
      '    │ ●  ● │/    ',
      '    │  ☞   │     ',
      '    │  ---  │    ',
      '    ╰──────╯     ',
      '    ↑ ERROR ↑    ',
    ],
  },

  // ── UNCOMMON ────────────────────────────────────────────
  {
    id: 6,
    name: 'AsyncPhantom',
    errorType: 'UnhandledPromiseRejection',
    patterns: [/unhandled.*promise/i, /rejection/i, /await/i, /async/i, /\.then/i],
    type: 'runtime',
    rarity: 'uncommon',
    hp: 32,
    xp: 40,
    ascii: [
      '   ░░▒▒▓▓▓▓▒▒░░  ',
      '   ░▒ ◉    ◉ ▒░  ',
      '   ░▒  ~~~~  ▒░  ',
      '   ░▒▒▒▒▒▒▒▒▒▒░  ',
      '    ░░▒ ?? ▒░░   ',
      '      ░▒▒▒░      ',
      '    ~pending~     ',
      '     ░░░░░░░      ',
    ],
  },
  {
    id: 7,
    name: 'InfiniteLoop',
    errorType: 'Timeout',
    patterns: [/timed? ?out/i, /infinite/i, /heap out of memory/i, /allocation failed/i],
    type: 'runtime',
    rarity: 'uncommon',
    hp: 45,
    xp: 50,
    ascii: [
      '      ╭───╮      ',
      '    ╭─┤   ├─╮    ',
      '    │ │ ◎ │ │    ',
      '    │ ╰─┬─╯ │    ',
      '    ╰───┤   │    ',
      '    ╭───┤   │    ',
      '    │ ╭─┴─╮ │    ',
      '    ╰─┤ ∞ ├─╯    ',
    ],
  },
  {
    id: 8,
    name: 'JSONGoblin',
    errorType: 'SyntaxError',
    patterns: [/json/i, /unexpected.*json/i, /json\.parse/i],
    type: 'syntax',
    rarity: 'uncommon',
    hp: 26,
    xp: 30,
    ascii: [
      '      { { {      ',
      '     ╱ ° ° ╲     ',
      '    │  ^^^   │   ',
      '    │ {key:  │   ',
      '    │  ???}  │   ',
      '     ╲______╱    ',
      '      } } }      ',
      '    ~corrupt~     ',
    ],
  },
  {
    id: 9,
    name: 'ImportWraith',
    errorType: 'ModuleError',
    patterns: [
      /cannot find module/i,
      /module not found/i,
      /import/i,
      /require.*is not/i,
      /err_module/i,
    ],
    type: 'syntax',
    rarity: 'uncommon',
    hp: 30,
    xp: 35,
    ascii: [
      '    ╔══╗  ╔══╗   ',
      '    ║░░║  ║░░║   ',
      '    ║░░╚══╝░░║   ',
      '    ║ ×    × ║   ',
      '    ║  ....  ║   ',
      '    ╚╗      ╔╝   ',
      '     ║ 404  ║    ',
      '     ╚══════╝    ',
    ],
  },

  // ── RARE ────────────────────────────────────────────────
  {
    id: 10,
    name: 'RaceGremlin',
    errorType: 'RaceCondition',
    patterns: [/race/i, /concurrent/i, /econnreset/i, /socket hang up/i],
    type: 'logic',
    rarity: 'rare',
    hp: 38,
    xp: 75,
    ascii: [
      '   ⚡ ╭─────╮ ⚡  ',
      '     ╱ ◉   ◉╲    ',
      '    │ ╱ ─── ╲ │  ',
      '    ││  >>>  ││  ',
      '    │╲ ─── ╱  │  ',
      '     ╲◉   ◉╱     ',
      '   ⚡ ╰─────╯ ⚡  ',
      '    ~R A C E~    ',
    ],
  },
  {
    id: 11,
    name: 'LeakHydra',
    errorType: 'MemoryLeak',
    patterns: [/memory/i, /leak/i, /heap/i, /buffer/i, /emfile/i, /too many open/i],
    type: 'memory',
    rarity: 'rare',
    hp: 50,
    xp: 80,
    ascii: [
      '   ╱O╲ ╱O╲ ╱O╲   ',
      '   │ │ │ │ │ │   ',
      '   ╰─┤ │ ├─╯    ',
      '     │ │ │       ',
      '     ╰─┼─╯       ',
      '     ╱███╲       ',
      '    ╱█████╲      ',
      '    ▓▓▓▓▓▓▓      ',
    ],
  },

  // ── LEGENDARY ───────────────────────────────────────────
  {
    id: 12,
    name: 'Heisenbug',
    errorType: 'Heisenbug',
    patterns: [/segmentation fault/i, /segfault/i, /sigsegv/i, /bus error/i, /core dump/i],
    type: 'logic',
    rarity: 'legendary',
    hp: 55,
    xp: 150,
    ascii: [
      '  ✦ ░░▒▒▓▓▒▒░░ ✦ ',
      '    ▒ ?     ? ▒   ',
      '    ▓         ▓   ',
      '    ▓  ?   ?  ▓   ',
      '    ▓    ~    ▓   ',
      '    ▒         ▒   ',
      '  ✦ ░░▒▒▓▓▒▒░░ ✦ ',
      '   ~~quantum~~    ',
    ],
  },
  {
    id: 13,
    name: 'ForkBomb',
    errorType: 'ForkBomb',
    patterns: [/spawn/i, /fork/i, /child.?process/i, /eacces/i, /eperm/i, /permission denied/i],
    type: 'devops',
    rarity: 'legendary',
    hp: 60,
    xp: 200,
    ascii: [
      '    :(){ :|:& }   ',
      '     ╱╲   ╱╲     ',
      '    ╱╲╱╲ ╱╲╱╲    ',
      '   ╱╲╱╲╱╲╱╲╱╲   ',
      '   ● ● ● ● ● ●  ',
      '   ╲╱╲╱╲╱╲╱╲╱   ',
      '    ╲╱╲╱ ╲╱╲╱    ',
      '     ╲╱   ╲╱     ',
    ],
  },
];

// ── FALLBACK ──────────────────────────────────────────────

const UNKNOWN_BUG: BugDexEntry = {
  id: 0,
  name: 'UnknownBug',
  errorType: 'Error',
  patterns: [],
  type: 'runtime',
  rarity: 'common',
  hp: 20,
  xp: 15,
  ascii: [
    '    ╭──────╮      ',
    '    │  ??  │      ',
    '    │ (o_o)│      ',
    '    │  ??  │      ',
    '    ╰──┬┬──╯      ',
    '       ││         ',
    '    ╭──┘└──╮      ',
    '    ╰──────╯      ',
  ],
};

/**
 * Match a stderr/error string to the best BugMon.
 * Returns a copy of the matched monster.
 */
export function identify(errorText: string): BugDexEntry {
  let best: BugDexEntry | null = null;
  let bestScore = 0;

  for (const mon of BUGDEX) {
    let score = 0;
    for (const pat of mon.patterns) {
      if (pat.test(errorText)) {
        score++;
      }
    }
    if (errorText.includes(mon.errorType)) {
      score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = mon;
    }
  }

  return best ? { ...best } : { ...UNKNOWN_BUG };
}

/**
 * Return the full BugDex for display.
 */
export function getAllMonsters(): BugDexEntry[] {
  return BUGDEX.map((m) => ({ ...m }));
}

export { BUGDEX };
