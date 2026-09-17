import { authorize } from "../auth/authorize.js";
import { createDnsRecord, deleteDnsRecord, getZone, listDnsRecords, listWorkers, listZones, updateDnsRecord } from "./resources.js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined> };
type Response = { status: number; body: unknown };

export async function handleCloudflareResource(req: Req, pathname: string, body?: Record<string, unknown>): Promise<Response | null> {
  const read = authorize(req, "cloudflare:read");
  const write = authorize(req, "cloudflare:write");
  if (pathname === "/api/cloudflare/zones" && req.method === "GET") return read ? { status: 200, body: await listZones() } : { status: 401, body: { error: "unauthorized" } };
  const zoneMatch = pathname.match(/^\/api\/cloudflare\/zones\/([^/]+)$/);
  if (zoneMatch && req.method === "GET") return read ? { status: 200, body: await getZone(zoneMatch[1]) } : { status: 401, body: { error: "unauthorized" } };
  const dnsMatch = pathname.match(/^\/api\/cloudflare\/zones\/([^/]+)\/dns-records$/);
  if (dnsMatch && req.method === "GET") return read ? { status: 200, body: await listDnsRecords(dnsMatch[1]) } : { status: 401, body: { error: "unauthorized" } };
  if (dnsMatch && req.method === "POST") return write ? { status: 201, body: await createDnsRecord(dnsMatch[1], body ?? {}) } : { status: 403, body: { error: "forbidden" } };
  const recordMatch = pathname.match(/^\/api\/cloudflare\/zones\/([^/]+)\/dns-records\/([^/]+)$/);
  if (recordMatch && req.method === "PUT") return write ? { status: 200, body: await updateDnsRecord(recordMatch[1], recordMatch[2], body ?? {}) } : { status: 403, body: { error: "forbidden" } };
  if (recordMatch && req.method === "DELETE") return write ? { status: 200, body: await deleteDnsRecord(recordMatch[1], recordMatch[2]) } : { status: 403, body: { error: "forbidden" } };
  if (pathname === "/api/cloudflare/workers" && req.method === "GET") return read ? { status: 200, body: await listWorkers() } : { status: 401, body: { error: "unauthorized" } };
  return null;
}
