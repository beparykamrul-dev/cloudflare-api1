import type { IncomingHttpHeaders } from "node:http";
import { authorize } from "../auth/authorize.js";
import { detectDrift } from "./drift.js";
import { expectedToInventoryItem, listExpectedResources, upsertExpectedResource, archiveExpectedResource } from "./expected.js";
import { getInventorySnapshot, setInventorySnapshot, persistInventorySnapshot } from "./cache.js";
import { discoverInventory } from "./discovery.js";
import { writeAudit } from "../audit/store.js";
import type { RequestContext } from "../audit/context.js";

export async function handleInventoryApi(
  req: { method?: string; headers: IncomingHttpHeaders },
  url: URL,
  body?: Record<string, unknown>,
  context?: RequestContext
): Promise<{ status: number; body: unknown } | null> {
  if (!url.pathname.startsWith("/api/inventory")) return null;

  if (req.method === "POST" && url.pathname === "/api/inventory/sync") {
    const principal = authorize(req, "inventory:sync");
    if (!principal) return { status: 401, body: { error: "unauthorized" } };
    let items;
    try {
      items = await discoverInventory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "inventory_discovery_failed";
      const status = message === "cloudflare_auth_failed" || message === "cloudflare_forbidden" ? 502 : 503;
      if (context) await writeAudit({ requestId: context.requestId, actorId: principal.id, action: "inventory.sync", result: "failed", resource: "inventory", metadata: { error: message } });
      return { status, body: { error: message === "cloudflare_auth_failed" || message === "cloudflare_forbidden" ? "inventory_provider_unauthorized" : "inventory_provider_unavailable" } };
    }
    const snapshot = setInventorySnapshot(items);
    await persistInventorySnapshot(snapshot);
    if (context) await writeAudit({ requestId: context.requestId, actorId: principal.id, action: "inventory.sync", result: "success", resource: "inventory", metadata: { count: items.length, observedAt: snapshot.observedAt } });
    return { status: 200, body: { observed_at: snapshot.observedAt, count: snapshot.items.length, items: snapshot.items } };
  }

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
    const item = await upsertExpectedResource({ resourceType, resourceId, scope, environment, name, source, metadata });
    const principal = authorize(req, "inventory:sync");
    if (context && principal) await writeAudit({ requestId: context.requestId, actorId: principal.id, action: "inventory.expected.upsert", result: "success", resource: `inventory:${item.resourceKey}`, metadata: { resourceType, resourceId, scope, environment } });
    return { status: 200, body: { item } };
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/inventory/expected/")) {
    if (!authorize(req, "inventory:sync")) return { status: 401, body: { error: "unauthorized" } };
    const key = decodeURIComponent(url.pathname.slice("/api/inventory/expected/".length));
    if (!key || key.length > 300) return { status: 400, body: { error: "invalid_resource_key" } };
    const archived = await archiveExpectedResource(key);
    const principal = authorize(req, "inventory:sync");
    if (archived && context && principal) await writeAudit({ requestId: context.requestId, actorId: principal.id, action: "inventory.expected.archive", result: "success", resource: `inventory:${key}`, metadata: {} });
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
