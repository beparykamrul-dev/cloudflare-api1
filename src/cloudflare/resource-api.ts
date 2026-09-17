import { authorize } from "../auth/authorize.js";
import { writeAudit } from "../audit/store.js";
import type { RequestContext } from "../audit/context.js";
import { createDnsRecord, deleteDnsRecord, getWorker, getZone, listDnsRecords, listWorkers, listZones, updateDnsRecord } from "./resources.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined> };
type Response = { status: number; body: unknown };

async function audit(context: RequestContext, actorId: string, action: string, result: string, resource: string, metadata: Record<string, unknown> = {}): Promise<void> {
  try {
    await writeAudit({ requestId: context.requestId, actorId, action, result, resource, metadata });
  } catch (error) {
    console.error(JSON.stringify({ event: "audit_write_failed", request_id: context.requestId, action, error: error instanceof Error ? error.message : "unknown_error" }));
  }
}

export async function handleCloudflareResource(req: Req, pathname: string, body?: Record<string, unknown>, context?: RequestContext): Promise<Response | null> {
  const read = authorize(req, "cloudflare:read");
  const write = authorize(req, "cloudflare:write");
  if (pathname === "/api/cloudflare/zones" && req.method === "GET") return read ? { status: 200, body: await listZones() } : { status: 401, body: { error: "unauthorized" } };
  const zoneMatch = pathname.match(/^\/api\/cloudflare\/zones\/([^/]+)$/);
  if (zoneMatch && req.method === "GET") {
    const zoneId = zoneMatch[1];
    if (!zoneId) return { status: 400, body: { error: "invalid_zone_id" } };
    return read ? { status: 200, body: await getZone(zoneId) } : { status: 401, body: { error: "unauthorized" } };
  }
  const dnsMatch = pathname.match(/^\/api\/cloudflare\/zones\/([^/]+)\/dns-records$/);
  if (dnsMatch) {
    const zoneId = dnsMatch[1];
    if (!zoneId) return { status: 400, body: { error: "invalid_zone_id" } };
    if (req.method === "GET") return read ? { status: 200, body: await listDnsRecords(zoneId) } : { status: 401, body: { error: "unauthorized" } };
    if (req.method === "POST") {
      if (!write) return { status: 403, body: { error: "forbidden" } };
      const principal = authorize(req, "cloudflare:write");
      try {
        const created = await createDnsRecord(zoneId, body ?? {});
        if (context && principal) await audit(context, principal.id, "cloudflare.dns_record.created", "success", `cloudflare:zone:${zoneId}:dns-record`, { zoneId });
        return { status: 201, body: created };
      } catch (error) {
        if (context && principal) await audit(context, principal.id, "cloudflare.dns_record.created", "failed", `cloudflare:zone:${zoneId}:dns-record`, { zoneId });
        throw error;
      }
    }
  }
  const recordMatch = pathname.match(/^\/api\/cloudflare\/zones\/([^/]+)\/dns-records\/([^/]+)$/);
  if (recordMatch) {
    const zoneId = recordMatch[1];
    const recordId = recordMatch[2];
    if (!zoneId || !recordId) return { status: 400, body: { error: "invalid_record_path" } };
    if (req.method === "PUT") {
      if (!write) return { status: 403, body: { error: "forbidden" } };
      const principal = authorize(req, "cloudflare:write");
      try {
        const updated = await updateDnsRecord(zoneId, recordId, body ?? {});
        if (context && principal) await audit(context, principal.id, "cloudflare.dns_record.updated", "success", `cloudflare:dns-record:${recordId}`, { zoneId, recordId });
        return { status: 200, body: updated };
      } catch (error) {
        if (context && principal) await audit(context, principal.id, "cloudflare.dns_record.updated", "failed", `cloudflare:dns-record:${recordId}`, { zoneId, recordId });
        throw error;
      }
    }
    if (req.method === "DELETE") {
      if (!write) return { status: 403, body: { error: "forbidden" } };
      const principal = authorize(req, "cloudflare:write");
      try {
        const deleted = await deleteDnsRecord(zoneId, recordId);
        if (context && principal) await audit(context, principal.id, "cloudflare.dns_record.deleted", "success", `cloudflare:dns-record:${recordId}`, { zoneId, recordId });
        return { status: 200, body: deleted };
      } catch (error) {
        if (context && principal) await audit(context, principal.id, "cloudflare.dns_record.deleted", "failed", `cloudflare:dns-record:${recordId}`, { zoneId, recordId });
        throw error;
      }
    }
  }
  if (pathname === "/api/cloudflare/workers" && req.method === "GET") return read ? { status: 200, body: await listWorkers() } : { status: 401, body: { error: "unauthorized" } };
  const workerMatch = pathname.match(/^\/api\/cloudflare\/workers\/([^/]+)$/);
  if (workerMatch && req.method === "GET") {
    const scriptName = workerMatch[1];
    if (!scriptName) return { status: 400, body: { error: "invalid_worker_name" } };
    return read ? { status: 200, body: await getWorker(decodeURIComponent(scriptName)) } : { status: 401, body: { error: "unauthorized" } };
  }
  return null;
}
