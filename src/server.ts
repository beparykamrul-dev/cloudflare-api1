import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { discoverInventory } from "./inventory/discovery.js";
import { handleInventoryApi } from "./inventory/api.js";
import { getInventorySnapshot, setInventorySnapshot, loadInventorySnapshot, persistInventorySnapshot } from "./inventory/cache.js";
import type { InventoryItem } from "./inventory/types.js";
import { authorize, authorizationEnabled } from "./auth/authorize.js";
import { loadApiTokens, startApiTokenRefresh } from "./auth/token-store.js";
import { allowRequest, rateLimitKey } from "./security/rate-limit.js";
import { handleCloudflareResource } from "./cloudflare/resource-api.js";
import { normalizeCloudflareError } from "./cloudflare/validation.js";
import { handleDnsApi } from "./dns/api.js";
import { handleDeploymentApi, handleDeploymentStatusCallback } from "./deployments/api.js";
import { metricsText, recordRequest } from "./monitoring/metrics.js";
import { evaluateReadiness, hydrateAlerts } from "./monitoring/alerts.js";
import { handleMonitoringApi } from "./monitoring/api.js";
import { handleControlPanelApi } from "./control-panel/api.js";
import { handleControlPlaneDataApi } from "./control-panel/data-api.js";
import { controlPanelHtml } from "./control-panel/ui.js";
import { assertProductionConfig, securityConfig } from "./security/config.js";
import { securityHeaders } from "./security/headers.js";
import { checkDb } from "./db/client.js";

const port = Number(process.env.PORT ?? 8080);
assertProductionConfig();
const runtimeConfig = securityConfig();
if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error("invalid_port");
if (authorizationEnabled()) {
  await loadApiTokens();
  startApiTokenRefresh();
}
try {
  await hydrateAlerts();
} catch (error) {
  console.warn(JSON.stringify({ event: "alert_hydration_skipped", error: error instanceof Error ? error.message : "unknown_error" }));
}
const maxBodyBytes = runtimeConfig.maxBodyBytes;
const inventoryTtlMs = Math.max(1_000, Number(process.env.FTN_INVENTORY_CACHE_TTL_MS ?? 30000));
await loadInventorySnapshot();

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(securityHeaders())) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function textResponse(res: import("node:http").ServerResponse, body: string): void {
  for (const [key, value] of Object.entries(securityHeaders())) res.setHeader(key, value);
  res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
  res.end(body);
}

async function readRaw(req: import("node:http").IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("request_body_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRaw(req);
  if (!raw.trim()) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_json_body");
    return value as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json_body");
  }
}

async function inventory(refresh = false): Promise<{ observedAt: string; items: InventoryItem[] }> {
  const cached = getInventorySnapshot();
  if (!refresh && cached && Date.now() - new Date(cached.observedAt).getTime() < inventoryTtlMs) return cached;
  const snapshot = await discoverInventory();
  const value = setInventorySnapshot(snapshot);
  await persistInventorySnapshot(value);
  return value;
}

const server = createServer(async (req, res) => {
  const requestId = randomUUID();
  const context = { requestId };
  const startedAt = process.hrtime.bigint();
  res.once("finish", () => recordRequest(req.method ?? "GET", new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname, res.statusCode, Number(process.hrtime.bigint() - startedAt) / 1e9));
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const limit = allowRequest(rateLimitKey(req));
    if (!limit.allowed) {
      res.setHeader("retry-after", String(limit.retryAfter));
      return json(res, 429, { error: "rate_limited", request_id: requestId, retry_after: limit.retryAfter });
    }
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { status: "ok", service: "ftn-cloudflare-api", request_id: requestId });
    if (req.method === "GET" && url.pathname === "/health/live") return json(res, 200, { status: "live", request_id: requestId });
    if (req.method === "GET" && url.pathname === "/health/ready") {
      const dbReady = await checkDb();
      const cloudflareReady = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
      const changed = await evaluateReadiness(dbReady, cloudflareReady);
      if (changed.length) console.warn(JSON.stringify({ request_id: requestId, alerts: changed }));
      const ready = dbReady && cloudflareReady;
      return json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready", checks: { database: dbReady, cloudflare: cloudflareReady }, request_id: requestId });
    }
    if (req.method === "GET" && url.pathname === "/metrics") {
      const metricsPublic = process.env.FTN_METRICS_PUBLIC === "true" && runtimeConfig.environment !== "production";
      if (!metricsPublic && !authorize(req, "monitoring:read")) return json(res, 401, { error: "unauthorized", request_id: requestId });
      res.statusCode = 200;
      for (const [key, value] of Object.entries(securityHeaders())) res.setHeader(key, value);
      return textResponse(res, metricsText());
    }
    if (req.method === "GET" && url.pathname === "/api/auth/me") { const principal = authorize(req, "services:read"); if (!principal) return json(res, 401, { error: "unauthorized", request_id: requestId }); return json(res, 200, { request_id: requestId, principal }); }
    if (url.pathname === "/api/panel" && req.method === "GET") { const result = handleControlPanelApi(req, url.pathname); if (result) return json(res, result.status, { request_id: requestId, ...(result.body as Record<string, unknown>) }); }
    if (url.pathname === "/api/services" || url.pathname === "/api/audit") { const result = await handleControlPlaneDataApi(req, url.pathname, url.searchParams); if (result) return json(res, result.status, { request_id: requestId, ...(result.body as Record<string, unknown>) }); }
    if (url.pathname.startsWith("/api/monitoring/")) { const result = await handleMonitoringApi(req, url.pathname, url.searchParams); if (result) return json(res, result.status, { request_id: requestId, ...(result.body as Record<string, unknown>) }); }
    if (url.pathname === "/api/webhooks/deployment-status" && req.method === "POST") { const result = await handleDeploymentStatusCallback(req.headers, await readRaw(req), context); return json(res, result.status, { request_id: requestId, ...(result.body as Record<string, unknown>) }); }
    if (url.pathname.startsWith("/api/inventory/expected") || url.pathname === "/api/inventory/drift") {
      const body = req.method === "POST" ? await readJson(req) : undefined;
      const result = await handleInventoryApi(req, url, body, context);
      if (result) return json(res, result.status, { request_id: requestId, ...(result.body && typeof result.body === "object" ? result.body : { result: result.body }) });
    }
    if (url.pathname.startsWith("/api/deployments")) { const body = req.method === "POST" ? await readJson(req) : undefined; const result = await handleDeploymentApi(req, url.pathname, body, context, url.searchParams); if (result) return json(res, result.status, { request_id: requestId, ...(result.body && typeof result.body === "object" ? result.body : { result: result.body }) }); }
    if (url.pathname.startsWith("/api/cloudflare/")) { const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH" ? await readJson(req) : undefined; const result = await handleCloudflareResource(req, url.pathname, body, context); if (result) return json(res, result.status, { request_id: requestId, ...(result.body && typeof result.body === "object" ? result.body : { result: result.body }) }); }
    if (url.pathname.startsWith("/api/dns/")) { const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH" ? await readJson(req) : undefined; const result = await handleDnsApi(req, url, body, context); if (result) return json(res, result.status, { request_id: requestId, ...(result.body && typeof result.body === "object" ? result.body : { result: result.body }) }); }
    if (req.method === "GET" && url.pathname === "/api/inventory") { if (!authorize(req, "inventory:read")) return json(res, 401, { error: "unauthorized", request_id: requestId }); const snapshot = getInventorySnapshot(); if (!snapshot) return json(res, 503, { error: "inventory_sync_required", request_id: requestId }); return json(res, 200, { request_id: requestId, observed_at: snapshot.observedAt, count: snapshot.items.length, items: snapshot.items }); }
    if (req.method === "GET" && url.pathname.startsWith("/api/inventory/")) { if (!authorize(req, "inventory:read")) return json(res, 401, { error: "unauthorized", request_id: requestId }); const kind = url.pathname.split("/").pop(); const snapshot = getInventorySnapshot(); if (!snapshot) return json(res, 503, { error: "inventory_sync_required", request_id: requestId }); const aliases: Record<string, string> = { accounts: "account", zones: "zone", workers: "worker", storage: "r2_bucket", ai: "ai_gateway", queues: "queue", kv: "kv_namespace", d1: "d1_database", vectorize: "vectorize_index", hyperdrive: "hyperdrive", containers: "container" }; const resourceType = aliases[kind ?? ""]; if (!resourceType) return json(res, 404, { error: "unknown_inventory_scope", request_id: requestId }); const items = snapshot.items.filter((item) => item.resourceType === resourceType); return json(res, 200, { request_id: requestId, observed_at: snapshot.observedAt, count: items.length, items }); }
    if (req.method === "GET" && url.pathname === "/panel") { res.statusCode = 200; res.setHeader("content-type", "text/html; charset=utf-8"); for (const [key, value] of Object.entries(securityHeaders())) res.setHeader(key, value); return res.end(controlPanelHtml()); }
    return json(res, 404, { error: "not_found", request_id: requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"; console.error(JSON.stringify({ request_id: requestId, error: message }));
    const status = message === "request_body_too_large" ? 413 : message === "invalid_json_body" ? 400 : message.startsWith("cloudflare_") ? normalizeCloudflareError(error).status : 500;
    const errorCode = status === 500 ? "internal_error" : message === "request_body_too_large" ? message : message === "invalid_json_body" ? message : message.startsWith("cloudflare_") ? normalizeCloudflareError(error).error : "request_failed";
    return json(res, status, { error: errorCode, request_id: requestId });
  }
});
server.listen(port, "0.0.0.0", () => console.log(`ftn-cloudflare-api listening on ${port}`));
