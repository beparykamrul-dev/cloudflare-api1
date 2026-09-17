import { authorize } from "../auth/authorize.js";
import { getDb } from "../db/client.js";

export async function handleControlPlaneDataApi(
  req: { method?: string; headers: Record<string, string | string[] | undefined> },
  pathname: string,
  searchParams: URLSearchParams
): Promise<{ status: number; body: unknown } | null> {
  if (pathname === "/api/services" && req.method === "GET") {
    if (!authorize(req, "services:read")) return { status: 401, body: { error: "unauthorized" } };
    const result = await getDb().query(
      `SELECT service_id, service_name, service_type, repository, status, metadata, created_at, updated_at
       FROM ftn_services ORDER BY service_name ASC LIMIT $1`,
      [Math.min(Math.max(Number(searchParams.get("limit") ?? 200) || 200, 1), 500)]
    );
    return { status: 200, body: { services: result.rows } };
  }

  if (pathname === "/api/audit" && req.method === "GET") {
    if (!authorize(req, "audit:read")) return { status: 401, body: { error: "unauthorized" } };
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 100) || 100, 1), 500);
    const result = await getDb().query(
      `SELECT id, request_id, actor_id, service_id, environment, resource, action, result,
              commit_sha, deployment_id, metadata, created_at
       FROM ftn_audit_events ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return { status: 200, body: { events: result.rows } };
  }

  return null;
}
