import { createHash } from "node:crypto";
import { getDb } from "../db/client.js";
import { ROLE_PERMISSIONS, type Principal, type Role } from "./types.js";

type TokenRow = { id: string; principal_id: string; role: Role; permissions: unknown; token_hash: string; expires_at: Date | null };
const cache = new Map<string, TokenRow>();

function hashToken(token: string): string { return createHash("sha256").update(token, "utf8").digest("hex"); }

export async function loadApiTokens(): Promise<void> {
  cache.clear();
  const result = await getDb().query<TokenRow>("SELECT id, principal_id, role, permissions, token_hash, expires_at FROM ftn_api_tokens WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())");
  for (const row of result.rows) if (row.role in ROLE_PERMISSIONS) cache.set(row.token_hash, row);
}

export function principalFromApiToken(token: string): Principal | null {
  const row = cache.get(hashToken(token));
  if (!row || (row.expires_at && row.expires_at.getTime() <= Date.now())) return null;
  const permissions = Array.isArray(row.permissions) ? row.permissions.filter((p): p is Principal["permissions"][number] => typeof p === "string") : ROLE_PERMISSIONS[row.role];
  return { id: row.principal_id, role: row.role, permissions };
}
