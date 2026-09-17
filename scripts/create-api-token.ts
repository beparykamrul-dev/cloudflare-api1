import { randomBytes, randomUUID, createHash } from "node:crypto";
import { getDb } from "../src/db/client.js";
import { ROLE_PERMISSIONS, type Role } from "../src/auth/types.js";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const principalId = args.get("principal") || "ftn-service";
const role = (args.get("role") || "service") as Role;
const expiresDays = args.get("expires-days");
if (!(role in ROLE_PERMISSIONS)) throw new Error("invalid_role");
if (expiresDays !== undefined && (!/^\d+$/.test(expiresDays) || Number(expiresDays) < 1)) throw new Error("invalid_expires_days");

const token = `ftn_${randomBytes(32).toString("base64url")}`;
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
const expiresAt = expiresDays ? new Date(Date.now() + Number(expiresDays) * 86400000) : null;

await getDb().query(
  "INSERT INTO ftn_api_tokens (id, principal_id, role, permissions, token_hash, expires_at) VALUES ($1, $2, $3, $4::jsonb, $5, $6)",
  [randomUUID(), principalId, role, JSON.stringify(ROLE_PERMISSIONS[role]), tokenHash, expiresAt]
);

console.log(JSON.stringify({ principal_id: principalId, role, expires_at: expiresAt?.toISOString() ?? null, token }, null, 2));
await getDb().end();
