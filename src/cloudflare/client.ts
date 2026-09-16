import Cloudflare from "cloudflare";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function createCloudflareClient(): Cloudflare {
  return new Cloudflare({ apiToken: requireEnv("CLOUDFLARE_API_TOKEN") });
}

export function accountId(): string {
  return requireEnv("CLOUDFLARE_ACCOUNT_ID");
}
