import { authorize } from "../auth/authorize.js";
import { writeAudit } from "../audit/store.js";
import type { RequestContext } from "../audit/context.js";
import { findDdnsRecord, upsertDdns, type DdnsUpdate } from "./ddns.js";

export async function handleDnsApi(req: { method?: string; headers: Record<string, string | string[] | undefined> }, url: URL, body?: Record<string, unknown>, context?: RequestContext) {
  if (!url.pathname.startsWith("/api/dns/")) return null;
  if (req.method === "GET" && !authorize(req, "dns:read")) return { status: 401, body: { error: "unauthorized" } };
  if (req.method !== "GET" && !authorize(req, "dns:write")) return { status: 403, body: { error: "forbidden" } };
  const match = url.pathname.match(/^\/api\/dns\/ddns\/([^/]+)$/);
  if (!match) return { status: 404, body: { error: "not_found" } };
  const input = body as Partial<DdnsUpdate> | undefined;
  if (req.method === "POST") {
    if (!input?.zoneId || !input.name || !input.content || !input.type || !["A", "AAAA"].includes(input.type)) return { status: 400, body: { error: "invalid_ddns_request" } };
    const principal = authorize(req, "dns:write");
    try {
      const result = await upsertDdns({ zoneId: input.zoneId, recordId: input.recordId ?? "", name: input.name, content: input.content, type: input.type, proxied: input.proxied, ttl: input.ttl });
      if (context && principal) {
        await writeAudit({ requestId: context.requestId, actorId: principal.id, action: "dns.ddns.updated", result: "success", resource: `dns:ddns:${input.name}`, metadata: { zoneId: input.zoneId, recordId: input.recordId ?? null, type: input.type } }).catch((error) => console.error(JSON.stringify({ event: "audit_write_failed", request_id: context.requestId, action: "dns.ddns.updated", error: error instanceof Error ? error.message : "unknown_error" })));
      }
      return { status: 200, body: result };
    } catch (error) {
      if (context && principal) {
        await writeAudit({ requestId: context.requestId, actorId: principal.id, action: "dns.ddns.updated", result: "failed", resource: `dns:ddns:${input.name}`, metadata: { zoneId: input.zoneId, recordId: input.recordId ?? null, type: input.type } }).catch((auditError) => console.error(JSON.stringify({ event: "audit_write_failed", request_id: context.requestId, action: "dns.ddns.updated", error: auditError instanceof Error ? auditError.message : "unknown_error" })));
      }
      throw error;
    }
  }
  if (req.method === "GET") {
    const zoneId = url.searchParams.get("zoneId");
    const type = url.searchParams.get("type") as "A" | "AAAA" | null;
    return zoneId && (type === "A" || type === "AAAA") ? { status: 200, body: await findDdnsRecord(zoneId, decodeURIComponent(match[1]), type) } : { status: 400, body: { error: "zoneId_and_valid_type_required" } };
  }
  return { status: 405, body: { error: "method_not_allowed" } };
}
