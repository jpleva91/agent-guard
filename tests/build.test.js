import { suite, test } from './run.js';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MODULE_ORDER = [
  'ecosystem/data/monsters.js', 'ecosystem/data/moves.js', 'ecosystem/data/types.js', 'ecosystem/data/mapData.js', 'ecosystem/data/evolutions.js',
  'dist/game/engine/events.js', 'dist/game/engine/state.js', 'dist/game/audio/sound.js', 'dist/game/engine/input.js',
  'dist/game/sprites/sprites.js', 'dist/game/sprites/monster-gen.js', 'dist/game/sprites/tiles.js',
  'dist/game/world/map.js', 'dist/game/world/player.js', 'dist/game/world/encounters.js',
  'dist/game/engine/renderer.js', 'dist/game/engine/transition.js', 'dist/game/sync/save.js', 'dist/game/engine/title.js',
  'dist/game/battle/damage.js', 'dist/game/battle/battle-engine.js',
  'dist/game/evolution/tracker.js', 'dist/game/evolution/evolution.js', 'dist/game/evolution/animation.js',
  'dist/game/game.js',
];

suite('Variable collision detection', () => {
  test('no top-level const/let name collisions across modules', () => {
    const nameToFiles = new Map();
    const re = /^(?:export\s+)?(?:const|let)\s+(\w+)\s*[=;,]/gm;

    for (const mod of MODULE_ORDER) {
      const fp = path.join(ROOT, mod);
      if (!fs.existsSync(fp)) continue;
      const code = fs.readFileSync(fp, 'utf8');
      let m;
      while ((m = re.exec(code)) !== null) {
        const name = m[1];
        if (!nameToFiles.has(name)) nameToFiles.set(name, []);
        const files = nameToFiles.get(name);
        if (!files.includes(mod)) files.push(mod);
      }
    }

    const collisions = [];
    for (const [name, files] of nameToFiles) {
      // Ignore collisions between ecosystem/data and dist/game — data modules
      // export names that game modules legitimately re-use via import
      const gameFiles = files.filter(f => f.startsWith('dist/'));
      if (gameFiles.length > 1) collisions.push(`${name}: ${gameFiles.join(', ')}`);
    }
    assert.strictEqual(collisions.length, 0,
      `Found ${collisions.length} variable collision(s):\n  ${collisions.join('\n  ')}`);
  });
});

suite('Import path validation', () => {
  test('all ES module imports in index.html resolve to real files', () => {
    const htmlPath = path.join(ROOT, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Find all import ... from '...' statements
    const importRe = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let m;
    const errors = [];
    while ((m = importRe.exec(html)) !== null) {
      const importPath = m[1];
      // Resolve relative to ROOT (where index.html lives)
      const resolved = path.join(ROOT, importPath);
      if (!fs.existsSync(resolved)) {
        errors.push(`Import "${importPath}" resolves to "${resolved}" which does not exist`);
      }
    }

    // Also check <script type="module" src="..."> tags
    const srcRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/g;
    while ((m = srcRe.exec(html)) !== null) {
      const srcPath = m[1];
      const resolved = path.join(ROOT, srcPath);
      if (!fs.existsSync(resolved)) {
        errors.push(`Script src="${srcPath}" resolves to "${resolved}" which does not exist`);
      }
    }

    assert.strictEqual(errors.length, 0,
      `Found ${errors.length} broken import path(s):\n  ${errors.join('\n  ')}`);
  });
});
