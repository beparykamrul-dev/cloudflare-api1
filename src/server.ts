import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { discoverInventory } from "./inventory/discovery.js";
import { getInventorySnapshot, setInventorySnapshot } from "./inventory/cache.js";
import { authorize, authorizationEnabled } from "./auth/authorize.js";
import { loadApiTokens } from "./auth/token-store.js";
import { allowRequest, rateLimitKey } from "./security/rate-limit.js";
import { handleCloudflareResource } from "./cloudflare/resource-api.js";
import { metricsText, recordRequest } from "./monitoring/metrics.js";
import { handleControlPanelApi } from "./control-panel/api.js";
import { controlPanelHtml } from "./control-panel/ui.js";
import { assertProductionConfig } from "./security/config.js";
import { securityHeaders } from "./security/headers.js";
import { checkDb } from "./db/client.js";

assertProductionConfig();
const port = Number(process.env.PORT ?? 8080);
const environment = process.env.FTN_ENVIRONMENT ?? "development";
const cacheTtlMs = Number(process.env.INVENTORY_CACHE_TTL_MS ?? 60_000);
const maxBodyBytes = Number(process.env.FTN_MAX_BODY_BYTES ?? 1_048_576);

if (authorizationEnabled() && process.env.DATABASE_URL) await loadApiTokens();

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(securityHeaders())) res.setHeader(name, value);
  recordRequest("HTTP", "response", status);
  res.end(JSON.stringify(body));
}

async function readJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("request_body_too_large");
    chunks.push(buffer);
  }
  if (!size) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json_body");
  return parsed as Record<string, unknown>;
}

async function inventory(force = false) {
  const cached = getInventorySnapshot();
  if (!force && cached && Date.now() - Date.parse(cached.observedAt) < cacheTtlMs) return cached;
  return setInventorySnapshot(await discoverInventory());
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const requestId = randomUUID();
  for (const [name, value] of Object.entries(securityHeaders())) res.setHeader(name, value);
  res.setHeader("x-request-id", requestId);
  const limit = allowRequest(rateLimitKey(req));
  res.setHeader("x-ratelimit-remaining", String(limit.remaining));
  if (!limit.allowed) { res.setHeader("retry-after", String(limit.retryAfter)); return json(res, 429, { error: "rate_limited", request_id: requestId, retry_after: limit.retryAfter }); }
  try {
    if (req.method === "GET" && url.pathname === "/") { res.statusCode = 302; res.setHeader("location", "/panel"); return res.end(); }
    if (req.method === "GET" && url.pathname === "/panel") { res.statusCode = 200; res.setHeader("content-type", "text/html; charset=utf-8"); return res.end(controlPanelHtml()); }
    if (req.method === "GET" && url.pathname === "/health/live") return json(res, 200, { status: "ok", service: "ftn-cloudflare-api", request_id: requestId });
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { status: "ok", environment, service: "ftn-cloudflare-api", request_id: requestId });
    if (req.method === "GET" && url.pathname === "/health/ready") {
      const dbReady = process.env.DATABASE_URL ? await checkDb() : environment === "development";
      const cloudflareReady = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
      const ready = dbReady && cloudflareReady;
      return json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready", checks: { database: dbReady, cloudflare: cloudflareReady }, request_id: requestId });
    }
    if (req.method === "GET" && url.pathname === "/metrics") { res.statusCode = 200; res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8"); return res.end(metricsText()); }
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const principal = authorize(req, "services:read"); if (!principal) return json(res, 401, { error: "unauthorized", request_id: requestId });
      return json(res, 200, { request_id: requestId, principal });
    }
    if (url.pathname === "/api/panel" && req.method === "GET") {
      const result = handleControlPanelApi(req, url.pathname); if (result) return json(res, result.status, { request_id: requestId, ...(result.body as Record<string, unknown>) });
    }
    if (url.pathname.startsWith("/api/cloudflare/")) {
      const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH" ? await readJson(req) : undefined;
      const result = await handleCloudflareResource(req, url.pathname, body); if (result) return json(res, result.status, { request_id: requestId, ...(result.body && typeof result.body === "object" ? result.body : { result: result.body }) });
    }
    if (req.method === "GET" && url.pathname === "/api/inventory") {
      if (!authorize(req, "inventory:read")) return json(res, 401, { error: "unauthorized", request_id: requestId });
      const snapshot = await inventory(url.searchParams.get("refresh") === "true"); return json(res, 200, { request_id: requestId, observed_at: snapshot.observedAt, count: snapshot.items.length, items: snapshot.items });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/inventory/")) {
      if (!authorize(req, "inventory:read")) return json(res, 401, { error: "unauthorized", request_id: requestId });
      const kind = url.pathname.split("/").pop(); const snapshot = await inventory(false);
      const aliases: Record<string, string> = { accounts: "account", zones: "zone", workers: "worker", storage: "r2_bucket", ai: "ai_gateway", queues: "queue", kv: "kv_namespace", d1: "d1_database", vectorize: "vectorize_index", hyperdrive: "hyperdrive", containers: "container" };
      const resourceType = aliases[kind ?? ""]; if (!resourceType) return json(res, 404, { error: "unknown_inventory_scope", request_id: requestId });
      const items = snapshot.items.filter((item) => item.resourceType === resourceType); return json(res, 200, { request_id: requestId, observed_at: snapshot.observedAt, count: items.length, items });
    }
    return json(res, 404, { error: "not_found", request_id: requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"; console.error(JSON.stringify({ request_id: requestId, error: message }));
    const status = message === "request_body_too_large" ? 413 : message === "invalid_json_body" ? 400 : 500;
    return json(res, status, { error: status === 500 ? "internal_error" : message, request_id: requestId });
  }
});
server.listen(port, "0.0.0.0", () => console.log(`ftn-cloudflare-api listening on ${port}`));
