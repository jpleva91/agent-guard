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

// --- Squad hierarchy types ---

export type SquadRank =
  | 'director'
  | 'em'
  | 'product-lead'
  | 'architect'
  | 'senior'
  | 'junior'
  | 'qa';
export type AgentDriver = 'claude-code' | 'copilot-cli';
export type AgentModel = 'opus' | 'sonnet' | 'haiku' | 'copilot';

export interface SquadAgent {
  readonly id: string;
  readonly rank: SquadRank;
  readonly driver: AgentDriver;
  readonly model: AgentModel;
  readonly cron: string;
  readonly skills: readonly string[];
}

export interface Squad {
  readonly name: string;
  readonly repo: string; // repo name or '*' for cross-repo
  readonly em: SquadAgent;
  readonly agents: Readonly<Record<string, SquadAgent>>;
}

export interface SquadManifest {
  readonly version: string;
  readonly org: {
    readonly director: SquadAgent;
  };
  readonly squads: Readonly<Record<string, Squad>>;
  readonly loopGuards: LoopGuardConfig;
}

export interface LoopGuardConfig {
  readonly maxOpenPRsPerSquad: number;
  readonly maxRetries: number;
  readonly maxBlastRadius: number;
  readonly maxRunMinutes: number;
}

export interface SquadState {
  readonly squad: string;
  readonly sprint: {
    readonly goal: string;
    readonly issues: readonly string[];
  };
  readonly assignments: Readonly<
    Record<
      string,
      {
        readonly current: string | null;
        readonly status: string;
        readonly waiting?: string;
      }
    >
  >;
  readonly blockers: readonly string[];
  readonly prQueue: {
    readonly open: number;
    readonly reviewed: number;
    readonly mergeable: number;
  };
  readonly updatedAt: string;
}

export interface EMReport {
  readonly squad: string;
  readonly timestamp: string;
  readonly health: 'green' | 'yellow' | 'red';
  readonly summary: string;
  readonly blockers: readonly string[];
  readonly escalations: readonly string[];
  readonly metrics: {
    readonly prsOpened: number;
    readonly prsMerged: number;
    readonly issuesClosed: number;
    readonly denials: number;
    readonly retries: number;
  };
}

export interface DirectorBrief {
  readonly timestamp: string;
  readonly squads: Readonly<Record<string, EMReport>>;
  readonly escalationsForHuman: readonly string[];
  readonly overallHealth: 'green' | 'yellow' | 'red';
}
