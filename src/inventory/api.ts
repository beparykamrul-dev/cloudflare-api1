import type { IncomingHttpHeaders } from "node:http";
import { authorize } from "../auth/authorize.js";
import { detectDrift } from "./drift.js";
import { expectedToInventoryItem, listExpectedResources, upsertExpectedResource, archiveExpectedResource } from "./expected.js";
import { getInventorySnapshot } from "./cache.js";

export async function handleInventoryApi(
  req: { method?: string; headers: IncomingHttpHeaders },
  url: URL,
  body?: Record<string, unknown>
): Promise<{ status: number; body: unknown } | null> {
  if (!url.pathname.startsWith("/api/inventory")) return null;

  if (req.method === "GET" && url.pathname === "/api/inventory/expected") {
    if (!authorize(req, "inventory:read")) return { status: 401, body: { error: "unauthorized" } };
    const environment = url.searchParams.get("environment") ?? undefined;
    return { status: 200, body: { items: await listExpectedResources(environment) } };
  }

  if (req.method === "POST" && url.pathname === "/api/inventory/expected") {
    if (!authorize(req, "inventory:sync")) return { status: 401, body: { error: "unauthorized" } };
    if (!body || typeof body !== "object") return { status: 400, body: { error: "invalid_json_body" } };
    const resourceType = typeof body.resource_type === "string" ? body.resource_type.trim() : "";
    const resourceId = typeof body.resource_id === "string" ? body.resource_id.trim() : "";
    const scope = typeof body.scope === "string" ? body.scope.trim() : "";
    const environment = typeof body.environment === "string" ? body.environment.trim() : "global";
    const name = body.name == null ? undefined : String(body.name).trim();
    const source = body.source == null ? "registry" : String(body.source).trim();
    if (!resourceType || !resourceId || !scope || !environment || !source || resourceType.length > 100 || resourceId.length > 300 || scope.length > 300 || environment.length > 50 || source.length > 100) {
      return { status: 400, body: { error: "invalid_expected_resource" } };
    }
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
    return { status: 200, body: { item: await upsertExpectedResource({ resourceType, resourceId, scope, environment, name, source, metadata }) } };
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/inventory/expected/")) {
    if (!authorize(req, "inventory:sync")) return { status: 401, body: { error: "unauthorized" } };
    const key = decodeURIComponent(url.pathname.slice("/api/inventory/expected/".length));
    if (!key || key.length > 300) return { status: 400, body: { error: "invalid_resource_key" } };
    const archived = await archiveExpectedResource(key);
    return { status: archived ? 200 : 404, body: archived ? { status: "archived", resource_key: key } : { error: "expected_resource_not_found" } };
  }

  if (req.method === "GET" && url.pathname === "/api/inventory/drift") {
    if (!authorize(req, "inventory:read")) return { status: 401, body: { error: "unauthorized" } };
    const expected = (await listExpectedResources(url.searchParams.get("environment") ?? undefined)).map(expectedToInventoryItem);
    const observed = getInventorySnapshot()?.items ?? [];
    return { status: 200, body: { observed_at: getInventorySnapshot()?.observedAt ?? null, drift: detectDrift(expected, observed) } };
  }

  return null;
}
