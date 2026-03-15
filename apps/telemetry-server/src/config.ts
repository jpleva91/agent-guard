// Server configuration — parsed from environment variables.

export interface ServerConfig {
  readonly port: number;
  readonly allowedIps: string[];
  readonly apiKey: string | undefined;
  readonly isDev: boolean;
  readonly enrollmentEnabled: boolean;
  readonly maxRequestSizeMb: number;
  readonly rateLimitPerIp: number;
  readonly rateLimitPerInstall: number;
  readonly antiReplayWindowMs: number;
  readonly storageBackend: 'memory' | 'postgres';
}

export function loadConfig(): ServerConfig {
  const env = process.env;

  return {
    port: env.PORT ? Number(env.PORT) : 3001,
    allowedIps: env.ALLOWED_IPS
      ? env.ALLOWED_IPS.split(',')
          .map((ip) => ip.trim())
          .filter(Boolean)
      : [],
    apiKey: env.API_KEY || undefined,
    isDev: env.NODE_ENV === 'development',
    enrollmentEnabled: env.ENROLLMENT_ENABLED !== 'false',
    maxRequestSizeMb: env.MAX_REQUEST_SIZE_MB ? Number(env.MAX_REQUEST_SIZE_MB) : 1,
    rateLimitPerIp: env.RATE_LIMIT_PER_IP ? Number(env.RATE_LIMIT_PER_IP) : 100,
    rateLimitPerInstall: env.RATE_LIMIT_PER_INSTALL ? Number(env.RATE_LIMIT_PER_INSTALL) : 60,
    antiReplayWindowMs: env.ANTI_REPLAY_WINDOW_MS ? Number(env.ANTI_REPLAY_WINDOW_MS) : 300_000,
    storageBackend: env.POSTGRES_URL ? 'postgres' : 'memory',
  };
}
