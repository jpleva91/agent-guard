import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { loadManifest, filterAgentsByTier, resolveSchedule, collectSkills } from './manifest.js';
import type { SwarmConfig, ScaffoldResult, ScaffoldedAgent } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const TEMPLATES_DIR = join(PACKAGE_ROOT, 'templates');
const SKILLS_TEMPLATE_DIR = join(TEMPLATES_DIR, 'skills');
const PROMPTS_TEMPLATE_DIR = join(TEMPLATES_DIR, 'prompts');
const DEFAULT_CONFIG_TEMPLATE = join(TEMPLATES_DIR, 'config', 'agentguard-swarm.default.yaml');

export interface ScaffoldOptions {
  readonly projectRoot: string;
  readonly force?: boolean;
  readonly tiers?: readonly string[];
}

export function scaffold(options: ScaffoldOptions): ScaffoldResult {
  const { projectRoot, force = false } = options;

  // Write config file if it doesn't exist
  const configPath = join(projectRoot, 'agentguard-swarm.yaml');
  const configWritten = writeConfigIfMissing(configPath);

  // Load config (user's or default)
  const config = loadConfig(projectRoot);

  // Apply tier override from CLI flags
  const effectiveConfig: SwarmConfig = options.tiers
    ? {
        swarm: {
          ...config.swarm,
          tiers: options.tiers as SwarmConfig['swarm']['tiers'],
        },
      }
    : config;

  // Load manifest and filter agents
  const manifest = loadManifest();
  const enabledAgents = filterAgentsByTier(manifest.agents, effectiveConfig.swarm.tiers);
  const requiredSkills = collectSkills(enabledAgents);

  // Scaffold skills
  const skillsDir = join(projectRoot, '.claude', 'skills');
  mkdirSync(skillsDir, { recursive: true });

  let skillsWritten = 0;
  let skillsSkipped = 0;

  // Copy all available skill templates that are needed by enabled agents
  const availableTemplates = readdirSync(SKILLS_TEMPLATE_DIR).filter((f) => f.endsWith('.md'));

  for (const templateFile of availableTemplates) {
    const skillName = templateFile.replace('.md', '');
    if (!requiredSkills.includes(skillName)) {
      continue;
    }

    const targetPath = join(skillsDir, templateFile);
    if (existsSync(targetPath) && !force) {
      skillsSkipped++;
      continue;
    }

    const templateContent = readFileSync(join(SKILLS_TEMPLATE_DIR, templateFile), 'utf8');
    const rendered = renderTemplate(templateContent, effectiveConfig);
    writeFileSync(targetPath, rendered, 'utf8');
    skillsWritten++;
  }

  // Also copy skills that exist as templates but aren't in any agent's skill list
  // (utility skills like full-test, release-prepare, etc.)
  for (const templateFile of availableTemplates) {
    const skillName = templateFile.replace('.md', '');
    if (requiredSkills.includes(skillName)) {
      continue; // Already handled above
    }

    const targetPath = join(skillsDir, templateFile);
    if (existsSync(targetPath) && !force) {
      skillsSkipped++;
      continue;
    }

    const templateContent = readFileSync(join(SKILLS_TEMPLATE_DIR, templateFile), 'utf8');
    const rendered = renderTemplate(templateContent, effectiveConfig);
    writeFileSync(targetPath, rendered, 'utf8');
    skillsWritten++;
  }

  // Build agent entries with resolved prompts
  const agents: ScaffoldedAgent[] = enabledAgents.map((agent) => {
    const promptFile = join(PROMPTS_TEMPLATE_DIR, `${agent.promptTemplate}.md`);
    const promptContent = existsSync(promptFile) ? readFileSync(promptFile, 'utf8') : '';
    const renderedPrompt = renderTemplate(promptContent, effectiveConfig);

    return {
      id: agent.id,
      name: agent.name,
      tier: agent.tier,
      cron: resolveSchedule(agent, effectiveConfig),
      description: agent.description,
      prompt: renderedPrompt,
    };
  });

  return {
    skillsWritten,
    skillsSkipped,
    promptsWritten: agents.length,
    configWritten,
    agents,
  };
}

function writeConfigIfMissing(configPath: string): boolean {
  if (existsSync(configPath)) {
    return false;
  }
  copyFileSync(DEFAULT_CONFIG_TEMPLATE, configPath);
  return true;
}

function renderTemplate(content: string, config: SwarmConfig): string {
  const { paths, labels } = config.swarm;

  const replacements: Record<string, string> = {
    'paths.policy': paths.policy,
    'paths.roadmap': paths.roadmap,
    'paths.swarmState': paths.swarmState,
    'paths.logs': paths.logs,
    'paths.reports': paths.reports,
    'paths.swarmLogs': paths.swarmLogs,
    'paths.cli': paths.cli,
    'labels.pending': labels.pending,
    'labels.inProgress': labels.inProgress,
    'labels.review': labels.review,
    'labels.blocked': labels.blocked,
    'labels.critical': labels.critical,
    'labels.high': labels.high,
    'labels.medium': labels.medium,
    'labels.low': labels.low,
    'labels.developer': labels.developer,
    'labels.architect': labels.architect,
    'labels.auditor': labels.auditor,
  };

  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`<%= ${key} %>`, value);
  }
  return result;
}
