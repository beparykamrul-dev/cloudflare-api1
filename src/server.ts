import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { discoverInventory } from "./inventory/discovery.js";
import { getInventorySnapshot, setInventorySnapshot } from "./inventory/cache.js";
import { authorize } from "./auth/authorize.js";
import { allowRequest, rateLimitKey } from "./security/rate-limit.js";

const port = Number(process.env.PORT ?? 8080);
const environment = process.env.FTN_ENVIRONMENT ?? "development";
const cacheTtlMs = Number(process.env.INVENTORY_CACHE_TTL_MS ?? 60_000);

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.end(JSON.stringify(body));
}

async function inventory(force = false) {
  const cached = getInventorySnapshot();
  if (!force && cached && Date.now() - Date.parse(cached.observedAt) < cacheTtlMs) return cached;
  return setInventorySnapshot(await discoverInventory());
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const requestId = randomUUID();
  const limit = allowRequest(rateLimitKey(req));
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-ratelimit-remaining", String(limit.remaining));
  if (!limit.allowed) {
    res.setHeader("retry-after", String(limit.retryAfter));
    return json(res, 429, { error: "rate_limited", request_id: requestId, retry_after: limit.retryAfter });
  }

  try {
    if (req.method === "GET" && url.pathname === "/health/live") return json(res, 200, { status: "ok", service: "ftn-cloudflare-api", request_id: requestId });
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { status: "ok", environment, service: "ftn-cloudflare-api", request_id: requestId });
    if (req.method === "GET" && url.pathname === "/health/ready") {
      const ready = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
      return json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready", request_id: requestId });
    }
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const principal = authorize(req, "services:read");
      if (!principal) return json(res, 401, { error: "unauthorized", request_id: requestId });
      return json(res, 200, { request_id: requestId, principal });
    }
    if (req.method === "GET" && url.pathname === "/api/inventory") {
      if (!authorize(req, "inventory:read")) return json(res, 401, { error: "unauthorized", request_id: requestId });
      const snapshot = await inventory(url.searchParams.get("refresh") === "true");
      return json(res, 200, { request_id: requestId, observed_at: snapshot.observedAt, count: snapshot.items.length, items: snapshot.items });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/inventory/")) {
      if (!authorize(req, "inventory:read")) return json(res, 401, { error: "unauthorized", request_id: requestId });
      const kind = url.pathname.split("/").pop();
      const snapshot = await inventory(false);
      const aliases: Record<string, string> = { accounts: "account", zones: "zone", workers: "worker", storage: "r2_bucket", ai: "ai_gateway", queues: "queue", kv: "kv_namespace", d1: "d1_database", vectorize: "vectorize_index", hyperdrive: "hyperdrive", containers: "container" };
      const resourceType = aliases[kind ?? ""];
      if (!resourceType) return json(res, 404, { error: "unknown_inventory_scope", request_id: requestId });
      const items = snapshot.items.filter((item) => item.resourceType === resourceType);
      return json(res, 200, { request_id: requestId, observed_at: snapshot.observedAt, count: items.length, items });
    }
    return json(res, 404, { error: "not_found", request_id: requestId });
  } catch (error) {
    console.error(JSON.stringify({ request_id: requestId, error: error instanceof Error ? error.message : "unknown_error" }));
    return json(res, 500, { error: "internal_error", request_id: requestId });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`ftn-cloudflare-api listening on ${port}`));
