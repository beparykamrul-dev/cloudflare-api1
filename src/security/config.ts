export interface SecurityConfig {
  environment: string;
  authEnabled: boolean;
  trustProxy: boolean;
  maxBodyBytes: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

function positiveNumber(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`invalid_${name}`);
  return Math.floor(parsed);
}

export function securityConfig(): SecurityConfig {
  const environment = process.env.FTN_ENVIRONMENT ?? "development";
  return {
    environment,
    authEnabled: process.env.FTN_AUTH_ENABLED !== "false",
    trustProxy: process.env.FTN_TRUST_PROXY === "true",
    maxBodyBytes: positiveNumber("max_body_bytes", process.env.FTN_MAX_BODY_BYTES, 1_048_576),
    rateLimitMax: positiveNumber("rate_limit_max", process.env.FTN_RATE_LIMIT_MAX, 120),
    rateLimitWindowMs: positiveNumber("rate_limit_window_ms", process.env.FTN_RATE_LIMIT_WINDOW_MS, 60_000)
  };
}

export function assertProductionConfig(): void {
  if ((process.env.FTN_ENVIRONMENT ?? "development") !== "production") return;
  const required = ["DATABASE_URL", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`missing_production_config:${missing.join(",")}`);
  if (process.env.FTN_AUTH_ENABLED === "false") throw new Error("production_auth_cannot_be_disabled");
  if (process.env.FTN_AUTH_ALLOW_ROLE_HEADERS === "true") throw new Error("production_role_headers_cannot_be_enabled");
  securityConfig();
}
