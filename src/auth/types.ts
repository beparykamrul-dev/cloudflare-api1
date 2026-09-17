export type Role = "super_admin" | "admin" | "engineer" | "employee" | "user" | "service";

export type Permission =
  | "inventory:read"
  | "inventory:sync"
  | "services:read"
  | "deployments:read"
  | "deployments:write"
  | "cloudflare:read"
  | "cloudflare:write"
  | "dns:read"
  | "dns:write"
  | "audit:read"
  | "monitoring:read";

export interface Principal {
  id: string;
  role: Role;
  permissions: Permission[];
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ["inventory:read", "inventory:sync", "services:read", "deployments:read", "deployments:write", "cloudflare:read", "cloudflare:write", "dns:read", "dns:write", "audit:read", "monitoring:read"],
  admin: ["inventory:read", "inventory:sync", "services:read", "deployments:read", "deployments:write", "cloudflare:read", "cloudflare:write", "dns:read", "dns:write", "audit:read", "monitoring:read"],
  engineer: ["inventory:read", "inventory:sync", "services:read", "deployments:read", "deployments:write", "cloudflare:read", "cloudflare:write", "dns:read", "dns:write", "monitoring:read"],
  employee: ["inventory:read", "services:read", "deployments:read", "cloudflare:read", "dns:read", "monitoring:read"],
  user: ["inventory:read", "services:read"],
  service: ["inventory:read", "inventory:sync", "services:read", "deployments:read", "cloudflare:read", "monitoring:read"]
};
