// CLI command: agentguard plugin — manage installed plugins.
//
// Subcommands:
//   list              List all installed plugins
//   install <source>  Install a plugin from a local path
//   remove <id>       Remove an installed plugin
//   enable <id>       Enable a disabled plugin
//   disable <id>      Disable an installed plugin
//   search [query]    Search for plugins on npm

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPluginRegistry } from '../../plugins/registry.js';
import { searchNpmPlugins, searchLocalPlugins } from '../../plugins/discovery.js';
import type { PluginManifest } from '../../plugins/types.js';
import { bold, color, dim } from '../colors.js';

const STORAGE_DIR = '.agentguard';

/**
 * Main plugin command handler.
 *
 * Routes to the appropriate subcommand based on the first argument.
 */
export async function plugin(args: string[]): Promise<number> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'list':
    case 'ls':
      return pluginList();

    case 'install':
    case 'add':
      return pluginInstall(args.slice(1));

    case 'remove':
    case 'rm':
      return pluginRemove(args.slice(1));

    case 'enable':
      return pluginEnable(args.slice(1));

    case 'disable':
      return pluginDisable(args.slice(1));

    case 'search':
      return pluginSearch(args.slice(1));

    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printPluginHelp();
      return 0;

    default:
      console.error(`  Unknown plugin subcommand: ${subcommand}`);
      console.error('  Run "agentguard plugin help" for usage info.');
      return 1;
  }
}

function pluginList(): number {
  const registry = createPluginRegistry({ storageDir: STORAGE_DIR });
  const plugins = registry.list();

  if (plugins.length === 0) {
    console.log(`\n  ${dim('No plugins installed.')}`);
    console.log(`  ${dim('Run "agentguard plugin install <path>" to install a plugin.')}\n`);
    return 0;
  }

  console.log(`\n  ${bold('Installed Plugins')} ${dim(`(${plugins.length})`)}\n`);

  for (const p of plugins) {
    const status = p.enabled ? color('enabled', 'green') : color('disabled', 'yellow');
    const typeLabel = color(p.manifest.type, 'cyan');

    console.log(`  ${bold(p.manifest.name)} ${dim(`v${p.manifest.version}`)}`);
    console.log(`    ID:     ${p.manifest.id}`);
    console.log(`    Type:   ${typeLabel}`);
    console.log(`    Status: ${status}`);
    console.log(`    Source: ${dim(p.source)}`);
    if (p.manifest.description) {
      console.log(`    Desc:   ${dim(p.manifest.description)}`);
    }
    if (p.manifest.capabilities && p.manifest.capabilities.length > 0) {
      console.log(`    Caps:   ${dim(p.manifest.capabilities.join(', '))}`);
    }
    console.log();
  }

  return 0;
}

function pluginInstall(args: string[]): number {
  const source = args[0];
  if (!source) {
    console.error('  Error: Please specify a plugin source (local path or package name).');
    return 1;
  }

  const resolvedPath = resolve(source);

  // Try to load manifest from the source
  const manifest = loadManifestFromPath(resolvedPath);
  if (!manifest) {
    console.error(`  Error: Could not find a valid plugin manifest at "${source}".`);
    console.error('  Expected: package.json with an "agentguard" field containing the manifest.');
    return 1;
  }

  const registry = createPluginRegistry({ storageDir: STORAGE_DIR });
  const result = registry.install(manifest, source);

  if (!result.valid) {
    console.error(`\n  ${color('Installation failed', 'red')} for ${source}:\n`);
    for (const err of result.errors) {
      console.error(`    ${color('✗', 'red')} ${err.field}: ${err.message}`);
    }
    console.log();
    return 1;
  }

  console.log(
    `\n  ${color('✓', 'green')} Installed ${bold(manifest.name)} ${dim(`v${manifest.version}`)}`
  );
  console.log(`    ID:   ${manifest.id}`);
  console.log(`    Type: ${manifest.type}\n`);
  return 0;
}

function pluginRemove(args: string[]): number {
  const pluginId = args[0];
  if (!pluginId) {
    console.error('  Error: Please specify a plugin ID to remove.');
    return 1;
  }

  const registry = createPluginRegistry({ storageDir: STORAGE_DIR });
  const entry = registry.get(pluginId);

  if (!entry) {
    console.error(`  Error: Plugin "${pluginId}" is not installed.`);
    return 1;
  }

  const removed = registry.remove(pluginId);
  if (!removed) {
    console.error(`  Error: Cannot remove "${pluginId}" — other plugins depend on it.`);
    return 1;
  }

  console.log(
    `\n  ${color('✓', 'green')} Removed ${bold(entry.manifest.name)} ${dim(`v${entry.manifest.version}`)}\n`
  );
  return 0;
}

function pluginEnable(args: string[]): number {
  const pluginId = args[0];
  if (!pluginId) {
    console.error('  Error: Please specify a plugin ID to enable.');
    return 1;
  }

  const registry = createPluginRegistry({ storageDir: STORAGE_DIR });
  if (!registry.enable(pluginId)) {
    console.error(`  Error: Plugin "${pluginId}" is not installed.`);
    return 1;
  }

  console.log(`  ${color('✓', 'green')} Enabled "${pluginId}"`);
  return 0;
}

function pluginDisable(args: string[]): number {
  const pluginId = args[0];
  if (!pluginId) {
    console.error('  Error: Please specify a plugin ID to disable.');
    return 1;
  }

  const registry = createPluginRegistry({ storageDir: STORAGE_DIR });
  if (!registry.disable(pluginId)) {
    console.error(`  Error: Plugin "${pluginId}" is not installed.`);
    return 1;
  }

  console.log(`  ${color('✓', 'green')} Disabled "${pluginId}"`);
  return 0;
}

async function pluginSearch(args: string[]): Promise<number> {
  const query = args[0];
  const localDir = args.includes('--local') ? args[args.indexOf('--local') + 1] : undefined;

  console.log(`\n  ${bold('Searching for plugins')}${query ? ` matching "${query}"` : ''}...\n`);

  // Search npm registry
  const npmResults = await searchNpmPlugins(query);
  // Search local directory if specified
  const localResults = localDir ? searchLocalPlugins({ directory: localDir }) : [];

  const total = npmResults.length + localResults.length;

  if (total === 0) {
    console.log(`  ${dim('No plugins found.')}\n`);
    return 0;
  }

  if (npmResults.length > 0) {
    console.log(`  ${bold('npm registry')} ${dim(`(${npmResults.length} results)`)}\n`);
    for (const p of npmResults) {
      console.log(`    ${bold(p.name)} ${dim(`v${p.version}`)}`);
      if (p.description) {
        console.log(`      ${dim(p.description)}`);
      }
    }
    console.log();
  }

  if (localResults.length > 0) {
    console.log(`  ${bold('Local')} ${dim(`(${localResults.length} results)`)}\n`);
    for (const p of localResults) {
      console.log(
        `    ${bold(p.name)} ${dim(`v${p.version}`)} ${p.type ? color(p.type, 'cyan') : ''}`
      );
      if (p.description) {
        console.log(`      ${dim(p.description)}`);
      }
      console.log(`      ${dim(p.sourceId)}`);
    }
    console.log();
  }

  return 0;
}

/**
 * Load a PluginManifest from a local path.
 *
 * Expects the path to be a directory containing a package.json
 * with an "agentguard" field containing the plugin manifest.
 */
function loadManifestFromPath(dirPath: string): PluginManifest | null {
  const pkgPath = join(dirPath, 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const raw = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as {
      agentguard?: PluginManifest;
    };
    return pkg.agentguard ?? null;
  } catch {
    return null;
  }
}

function printPluginHelp(): void {
  console.log(`
  ${bold('agentguard plugin')} — Manage AgentGuard plugins

  ${bold('Usage:')}
    agentguard plugin <command> [options]

  ${bold('Commands:')}
    list, ls              List all installed plugins
    install, add <path>   Install a plugin from a local path
    remove, rm <id>       Remove an installed plugin by ID
    enable <id>           Enable a disabled plugin
    disable <id>          Disable an installed plugin
    search [query]        Search for plugins on npm

  ${bold('Examples:')}
    agentguard plugin list
    agentguard plugin install ./my-renderer-plugin
    agentguard plugin remove agentguard-renderer-json
    agentguard plugin disable agentguard-renderer-json
    agentguard plugin search renderer
    agentguard plugin search --local ./plugins
`);
}
