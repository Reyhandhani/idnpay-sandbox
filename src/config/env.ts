export interface AppConfig {
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly clientKey: string;
  readonly secretKey: string;
  readonly usingDefaultKeys: boolean;
  readonly merchantName: string;
  readonly merchantCity: string;
  readonly chargeExpiryMinutes: number;
  readonly transactionStoreLimit: number;
  readonly webhook: {
    readonly retryLimit: number;
    readonly timeoutMs: number;
    readonly tickMs: number;
  };
  readonly redisUrl: string | undefined;
  readonly simulation: {
    readonly latencyMs: number;
    readonly failureRate: number;
  };
  readonly dashboardEnabled: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_CLIENT_KEY = "idnpay-dev-client-key";
const DEFAULT_SECRET_KEY = "idnpay-dev-secret-key";

type Env = Readonly<Record<string, string | undefined>>;

function readString(env: Env, name: string, fallback: string): string {
  const raw = env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

function readInteger(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new ConfigError(`${name} must be an integer, got: "${raw}"`);
  }
  const value = Number(raw.trim());
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max}, got: ${value}`);
  }
  return value;
}

function readRate(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ConfigError(`${name} must be a number between 0 and 1, got: "${raw}"`);
  }
  return value;
}

function readOptional(env: Env, name: string): string | undefined {
  const raw = env[name];
  return raw === undefined || raw.trim() === "" ? undefined : raw.trim();
}

export function loadConfig(env: Env = process.env): AppConfig {
  const clientKey = readString(env, "CLIENT_KEY", DEFAULT_CLIENT_KEY);
  const secretKey = readString(env, "SECRET_KEY", DEFAULT_SECRET_KEY);

  return {
    host: readString(env, "HOST", "0.0.0.0"),
    port: readInteger(env, "PORT", 9000, 1, 65535),
    logLevel: readString(env, "LOG_LEVEL", "info"),
    clientKey,
    secretKey,
    usingDefaultKeys: clientKey === DEFAULT_CLIENT_KEY || secretKey === DEFAULT_SECRET_KEY,
    merchantName: readString(env, "MERCHANT_NAME", "IDNPAY MOCK").slice(0, 25),
    merchantCity: readString(env, "MERCHANT_CITY", "JAKARTA").slice(0, 15),
    chargeExpiryMinutes: readInteger(env, "CHARGE_EXPIRY_MINUTES", 60, 1, 60 * 24 * 7),
    transactionStoreLimit: readInteger(env, "TRANSACTION_STORE_LIMIT", 10_000, 10, 1_000_000),
    webhook: {
      retryLimit: readInteger(env, "WEBHOOK_RETRY_LIMIT", 5, 0, 10),
      timeoutMs: readInteger(env, "WEBHOOK_TIMEOUT_MS", 5000, 100, 60_000),
      tickMs: readInteger(env, "WEBHOOK_TICK_MS", 500, 10, 60_000),
    },
    redisUrl: readOptional(env, "REDIS_URL"),
    simulation: {
      latencyMs: readInteger(env, "SIMULATED_LATENCY_MS", 0, 0, 60_000),
      failureRate: readRate(env, "SIMULATED_FAILURE_RATE", 0),
    },
    dashboardEnabled: readString(env, "DASHBOARD_ENABLED", "true") !== "false",
  };
}
