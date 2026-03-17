export interface SwarmAgent {
  readonly id: string;
  readonly name: string;
  readonly tier: SwarmTier;
  readonly cron: string;
  readonly skills: readonly string[];
  readonly promptTemplate: string;
  readonly description: string;
}

export type SwarmTier = 'core' | 'governance' | 'ops' | 'quality' | 'marketing';

export interface SwarmManifest {
  readonly version: string;
  readonly agents: readonly SwarmAgent[];
}

export interface SwarmPaths {
  readonly policy: string;
  readonly roadmap: string;
  readonly swarmState: string;
  readonly logs: string;
  readonly reports: string;
  readonly swarmLogs: string;
  readonly cli: string;
}

export interface SwarmLabels {
  readonly pending: string;
  readonly inProgress: string;
  readonly review: string;
  readonly blocked: string;
  readonly critical: string;
  readonly high: string;
  readonly medium: string;
  readonly low: string;
  readonly developer: string;
  readonly architect: string;
  readonly auditor: string;
}

export interface SwarmThresholds {
  readonly maxOpenPRs: number;
  readonly prStaleHours: number;
  readonly blastRadiusHigh: number;
}

export interface SwarmConfig {
  readonly swarm: {
    readonly tiers: readonly SwarmTier[];
    readonly schedules: Readonly<Record<string, string>>;
    readonly paths: SwarmPaths;
    readonly labels: SwarmLabels;
    readonly thresholds: SwarmThresholds;
  };
}

export interface ScaffoldResult {
  readonly skillsWritten: number;
  readonly skillsSkipped: number;
  readonly promptsWritten: number;
  readonly configWritten: boolean;
  readonly agents: readonly ScaffoldedAgent[];
}

export interface ScaffoldedAgent {
  readonly id: string;
  readonly name: string;
  readonly tier: SwarmTier;
  readonly cron: string;
  readonly description: string;
  readonly prompt: string;
}
