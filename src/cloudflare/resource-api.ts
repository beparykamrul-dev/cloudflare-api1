import { authorize } from "../auth/authorize.js";
import { createDnsRecord, deleteDnsRecord, getZone, listDnsRecords, listWorkers, listZones, updateDnsRecord } from "./resources.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined> };
type Response = { status: number; body: unknown };

export async function handleCloudflareResource(req: Req, pathname: string, body?: Record<string, unknown>): Promise<Response | null> {
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
    if (req.method === "POST") return write ? { status: 201, body: await createDnsRecord(zoneId, body ?? {}) } : { status: 403, body: { error: "forbidden" } };
  }
  const recordMatch = pathname.match(/^\/api\/cloudflare\/zones\/([^/]+)\/dns-records\/([^/]+)$/);
  if (recordMatch) {
    const zoneId = recordMatch[1];
    const recordId = recordMatch[2];
    if (!zoneId || !recordId) return { status: 400, body: { error: "invalid_record_path" } };
    if (req.method === "PUT") return write ? { status: 200, body: await updateDnsRecord(zoneId, recordId, body ?? {}) } : { status: 403, body: { error: "forbidden" } };
    if (req.method === "DELETE") return write ? { status: 200, body: await deleteDnsRecord(zoneId, recordId) } : { status: 403, body: { error: "forbidden" } };
  }
  if (pathname === "/api/cloudflare/workers" && req.method === "GET") return read ? { status: 200, body: await listWorkers() } : { status: 401, body: { error: "unauthorized" } };
  return null;
}
