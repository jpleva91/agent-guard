#!/usr/bin/env node
// BugMon single-file builder — produces dist/index.html
// Dev dependencies: esbuild + terser (zero RUNTIME dependencies)
// Usage: node scripts/build.js [--no-sprites]

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { buildSync } from 'esbuild';
import { minify as terserMinify } from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const noSprites = process.argv.includes('--no-sprites');

console.log('Building BugMon single-file distribution...\n');

// --- Read and process all modules ---
function readModule(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    console.warn(`  warning: ${relPath} not found, skipping`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

function stripImportsExports(code) {
  // Remove import lines (named imports, default imports, side-effect imports)
  code = code.replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
  code = code.replace(/^\s*import\s+\w+\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
  code = code.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  // Remove dynamic imports (await import(...))
  code = code.replace(/^.*await\s+import\s*\([^)]*\).*$/gm, '');
  // Convert "export function" / "export async function" → "function" / "async function"
  code = code.replace(/^export\s+async\s+function\s/gm, 'async function ');
  code = code.replace(/^export\s+function\s/gm, 'function ');
  // Convert "export class" → "class"
  code = code.replace(/^export\s+class\s/gm, 'class ');
  // Convert "export const/let/var" → "const/let/var"
  code = code.replace(/^export\s+(const|let|var)\s/gm, '$1 ');
  // Remove "export { ... };" lines
  code = code.replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
  // Remove "export default" lines
  code = code.replace(/^export\s+default\s/gm, '');
  return code;
}

async function minifyWithTerser(code) {
  const terserResult = await terserMinify(code, {
    compress: {
      passes: 3,
      unsafe_math: true,
      unsafe_methods: true,
      unsafe_proto: true,
      drop_console: true,
      pure_getters: true,
      collapse_vars: true,
      reduce_vars: true,
      join_vars: true,
    },
    mangle: {
      toplevel: true,
    },
    format: {
      comments: false,
    },
  });
  return terserResult.code;
}

function minifyCSS(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  css = css.replace(/\s*([{}:;,>+~])\s*/g, '$1');
  css = css.replace(/;\}/g, '}');
  css = css.replace(/\s+/g, ' ');
  return css.trim();
}

// --- Sprite inlining (optional) ---
function inlineSprites() {
  if (noSprites) return '';

  const spriteDir = path.join(ROOT, 'game', 'sprites');
  const pngs = fs.readdirSync(spriteDir).filter(f => f.endsWith('.png'));

  if (pngs.length === 0) return '';

  let code = '\n// Inline sprite data URIs\n';
  code += '(function() {\n';
  code += '  const SPRITE_DATA = {\n';
  for (const png of pngs) {
    const name = png.replace('.png', '');
    const data = fs.readFileSync(path.join(spriteDir, png));
    const b64 = data.toString('base64');
    code += `    "${name}": "data:image/png;base64,${b64}",\n`;
  }
  code += '  };\n';
  code += '  const origPreload = preloadSprite;\n';
  code += '  preloadSprite = function(name) {\n';
  code += '    if (SPRITE_DATA[name]) {\n';
  code += '      return new Promise(resolve => {\n';
  code += '        const img = new Image();\n';
  code += '        img.onload = () => { spriteCache[name] = img; resolve(img); };\n';
  code += '        img.src = SPRITE_DATA[name];\n';
  code += '      });\n';
  code += '    }\n';
  code += '    return origPreload(name);\n';
  code += '  };\n';
  code += '})();\n';
  return code;
}

// --- Read index.html and extract parts ---
const html = readModule('index.html');

// Extract CSS from <style> tag
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const css = cssMatch ? minifyCSS(cssMatch[1]) : '';

// Extract HTML body content (between <body> and first <script>)
const bodyMatch = html.match(/<body>([\s\S]*?)<script/);
const bodyHTML = bodyMatch ? bodyMatch[1].trim() : '';

// Extract inline script (touch controls + mute)
const inlineScriptMatch = html.match(/<script type="module">\s*([\s\S]*?)<\/script>/);
const inlineScript = inlineScriptMatch ? inlineScriptMatch[1] : '';

// --- Bundle JS using esbuild's native bundler ---
// esbuild resolves the dependency graph automatically from the entry point,
// eliminating the need for manual MODULE_ORDER and regex import/export stripping.
const esbuildResult = buildSync({
  entryPoints: [path.join(ROOT, 'game', 'game.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
});

let bundle = esbuildResult.outputFiles[0].text;

// Append inline script (touch controls), stripping its imports since
// those modules are already bundled above
bundle += '\n' + stripImportsExports(inlineScript);

// Apply terser for additional compression on top of esbuild
let minBundle = await minifyWithTerser(bundle);

// Add sprite inlining after minification (base64 data is not minify-safe)
minBundle += inlineSprites();

// --- Assemble final HTML ---
const output = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
<title>BugMon</title>
<style>${css}</style>
</head>
<body>
${bodyHTML}
<script>${minBundle}</script>
</body>
</html>`;

// --- Write output ---
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);
const outPath = path.join(DIST, 'index.html');
fs.writeFileSync(outPath, output);

// --- Copy sprite PNGs for lazy loading (when not inlined) ---
if (noSprites) {
  const spriteDir = path.join(ROOT, 'game', 'sprites');
  const distSprites = path.join(DIST, 'sprites');
  if (!fs.existsSync(distSprites)) fs.mkdirSync(distSprites, { recursive: true });
  const pngs = fs.existsSync(spriteDir) ? fs.readdirSync(spriteDir).filter(f => f.endsWith('.png')) : [];
  for (const png of pngs) {
    fs.copyFileSync(path.join(spriteDir, png), path.join(distSprites, png));
  }
  if (pngs.length > 0) console.log(`\nCopied ${pngs.length} sprite PNGs to dist/sprites/ for lazy loading.`);
}

// --- Size report ---
const rawSize = output.length;
const gzipped = zlib.gzipSync(output);
const gzSize = gzipped.length;

// Calculate dev size (all source files)
let devSize = 0;
const devFiles = [];
function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'scripts' || entry.name === 'Documentation') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full);
    } else if (/\.(js|html|json|png)$/.test(entry.name)) {
      const size = fs.statSync(full).size;
      devSize += size;
      devFiles.push({ name: path.relative(ROOT, full), size });
    }
  }
}
walkDir(ROOT);

console.log('=== BugMon Build Report ===\n');
console.log(`Dev files:       ${devFiles.length} files, ${(devSize / 1024).toFixed(1)} KB`);
console.log(`Single file:     ${(rawSize / 1024).toFixed(1)} KB (${outPath})`);
console.log(`Gzipped:         ${(gzSize / 1024).toFixed(1)} KB`);
console.log(`Compression:     ${((1 - rawSize / devSize) * 100).toFixed(0)}% reduction from dev`);
console.log(`Gzip ratio:      ${((1 - gzSize / rawSize) * 100).toFixed(0)}% further reduction`);
console.log(`\nHTTP requests:   1 (down from ${devFiles.length})`);

if (noSprites) {
  console.log('\nBuilt without sprites (--no-sprites). Using procedural fallbacks.');
}

// --- Byte budget enforcement ---
const noBudget = process.argv.includes('--no-budget');

if (!noBudget) {
  const budgetPath = path.join(ROOT, 'size-budget.json');
  if (fs.existsSync(budgetPath)) {
    const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
    const green = s => `\x1b[32m${s}\x1b[0m`;
    const yellow = s => `\x1b[33m${s}\x1b[0m`;
    const red = s => `\x1b[31m${s}\x1b[0m`;
    const kb = b => (b / 1024).toFixed(1);
    let failed = false;

    console.log('\n=== Byte Budget ===\n');

    // Bundle check (gzipped, only meaningful for --no-sprites builds)
    if (noSprites && budget.bundle) {
      const { target, cap } = budget.bundle;
      const pctCap = ((1 - gzSize / cap) * 100).toFixed(0);

      if (gzSize <= target) {
        console.log(`Bundle:  ${green(`${kb(gzSize)} KB`)} / ${kb(target)} KB target ${green('✓')}`);
      } else {
        console.log(`Bundle:  ${yellow(`${kb(gzSize)} KB`)} / ${kb(target)} KB target ${yellow('⚠')}  over by ${kb(gzSize - target)} KB`);
      }

      if (gzSize <= cap) {
        console.log(`         ${green(`${kb(gzSize)} KB`)} / ${kb(cap)} KB cap    ${green('✓')}  ${pctCap}% headroom`);
      } else {
        console.log(`         ${red(`${kb(gzSize)} KB`)} / ${kb(cap)} KB cap    ${red('✗  OVER CAP by ' + kb(gzSize - cap) + ' KB')}`);
        failed = true;
      }
    }

    // Subsystem checks
    if (budget.subsystems) {
      console.log('\nSubsystems (source bytes):');
      const pad = (s, n) => s.padEnd(n);

      for (const [name, sub] of Object.entries(budget.subsystems)) {
        let total = 0;
        for (const pattern of sub.files) {
          if (pattern.includes('*')) {
            const dir = path.join(ROOT, path.dirname(pattern));
            const ext = pattern.split('*.')[1];
            if (fs.existsSync(dir)) {
              for (const f of fs.readdirSync(dir)) {
                if (f.endsWith('.' + ext)) {
                  total += fs.statSync(path.join(dir, f)).size;
                }
              }
            }
          } else {
            const fp = path.join(ROOT, pattern);
            if (fs.existsSync(fp)) total += fs.statSync(fp).size;
          }
        }

        const tStatus = total <= sub.target ? green('✓') : yellow('⚠');
        const cStatus = total <= sub.cap ? green('✓') : red('✗');
        console.log(`  ${pad(name + ':', 18)} ${pad(kb(total) + ' KB', 9)} / ${pad(kb(sub.target) + ' KB target', 16)} ${tStatus}  / ${pad(kb(sub.cap) + ' KB cap', 14)} ${cStatus}`);
      }
    }

    if (failed) {
      console.log(red('\n✗ BUILD FAILED: Bundle exceeds hard cap. Reduce size before merging.'));
      process.exit(1);
    }
    console.log('');
  }
}

console.log('Done! Open dist/index.html in any browser.');
