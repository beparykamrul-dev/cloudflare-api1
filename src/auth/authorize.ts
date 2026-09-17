import { createHash, randomUUID } from "node:crypto";
import { ROLE_PERMISSIONS, type Permission, type Principal, type Role } from "./types.js";

function headerValue(req: { headers: Record<string, string | string[] | undefined> }, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function configuredTokenPrincipal(token: string): Principal | null {
  const configured = process.env.FTN_API_TOKENS_JSON;
  if (!configured) return null;
  try {
    const tokens = JSON.parse(configured) as Record<string, { id?: string; role: Role }>;
    const digest = createHash("sha256").update(token).digest("hex");
    const entry = tokens[digest];
    if (!entry || !(entry.role in ROLE_PERMISSIONS)) return null;
    return { id: entry.id ?? `token:${digest.slice(0, 12)}`, role: entry.role, permissions: ROLE_PERMISSIONS[entry.role] };
  } catch { return null; }
}

export function principalFromRequest(req: { headers: Record<string, string | string[] | undefined> }): Principal | null {
  const authorization = headerValue(req, "authorization");
  if (authorization?.startsWith("Bearer ")) return configuredTokenPrincipal(authorization.slice(7).trim());
  if (process.env.FTN_AUTH_ALLOW_ROLE_HEADERS === "true") {
    const role = headerValue(req, "x-ftn-role");
    if (role && role in ROLE_PERMISSIONS) return { id: headerValue(req, "x-ftn-principal") ?? randomUUID(), role: role as Role, permissions: ROLE_PERMISSIONS[role as Role] };
  }
  return null;
}

export function hasPermission(principal: Principal | null, permission: Permission): boolean { return Boolean(principal?.permissions.includes(permission)); }
export function authorizationEnabled(): boolean { return process.env.FTN_AUTH_ENABLED !== "false"; }
export function authorize(req: { headers: Record<string, string | string[] | undefined> }, permission: Permission): Principal | null {
  if (!authorizationEnabled()) return { id: "local-development", role: "super_admin", permissions: ROLE_PERMISSIONS.super_admin };
  const principal = principalFromRequest(req);
  return hasPermission(principal, permission) ? principal : null;
}
