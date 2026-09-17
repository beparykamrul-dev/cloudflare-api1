import { randomUUID } from "node:crypto";
import { ROLE_PERMISSIONS, type Permission, type Principal, type Role } from "./types.js";

export function principalFromRequest(req: { headers: Record<string, string | string[] | undefined> }): Principal | null {
  const raw = req.headers["x-ftn-role"];
  const role = Array.isArray(raw) ? raw[0] : raw;
  if (!role || !(role in ROLE_PERMISSIONS)) return null;
  const typedRole = role as Role;
  return { id: String(req.headers["x-ftn-principal"] ?? randomUUID()), role: typedRole, permissions: ROLE_PERMISSIONS[typedRole] };
}

export function hasPermission(principal: Principal | null, permission: Permission): boolean {
  return Boolean(principal?.permissions.includes(permission));
}

export function authorizationEnabled(): boolean {
  return process.env.FTN_AUTH_ENABLED !== "false";
}

export function authorize(req: { headers: Record<string, string | string[] | undefined> }, permission: Permission): Principal | null {
  if (!authorizationEnabled()) return { id: "local-development", role: "super_admin", permissions: ROLE_PERMISSIONS.super_admin };
  const principal = principalFromRequest(req);
  return hasPermission(principal, permission) ? principal : null;
}
