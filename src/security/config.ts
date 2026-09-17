export interface SecurityConfig {
  environment: string;
  authEnabled: boolean;
  trustProxy: boolean;
  maxBodyBytes: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

export function securityConfig(): SecurityConfig {
  const environment = process.env.FTN_ENVIRONMENT ?? "development";
  return {
    environment,
    authEnabled: process.env.FTN_AUTH_ENABLED !== "false",
    trustProxy: process.env.FTN_TRUST_PROXY === "true",
    maxBodyBytes: Number(process.env.FTN_MAX_BODY_BYTES ?? 1_048_576),
    rateLimitMax: Number(process.env.FTN_RATE_LIMIT_MAX ?? 120),
    rateLimitWindowMs: Number(process.env.FTN_RATE_LIMIT_WINDOW_MS ?? 60_000)
  };
}

export function assertProductionConfig(): void {
  if ((process.env.FTN_ENVIRONMENT ?? "development") !== "production") return;
  const required = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`missing_production_config:${missing.join(",")}`);
  if (process.env.FTN_AUTH_ENABLED === "false") throw new Error("production_auth_cannot_be_disabled");
}
