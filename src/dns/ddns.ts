import { createDnsRecord, listDnsRecords, updateDnsRecord } from "../cloudflare/resources.js";

export interface DdnsUpdate { zoneId: string; recordId: string; type: "A" | "AAAA"; name: string; content: string; proxied?: boolean; ttl?: number; }

function validAddress(value: string, type: "A" | "AAAA"): boolean {
  if (type === "A") return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split(".").every((x) => Number(x) <= 255);
  return /^[0-9a-fA-F:]+$/.test(value) && value.includes(":");
}

export async function upsertDdns(input: DdnsUpdate): Promise<unknown> {
  if (!validAddress(input.content, input.type)) throw new Error("invalid_ip_address");
  const body = { type: input.type, name: input.name, content: input.content, proxied: input.proxied ?? false, ttl: input.ttl ?? 300 };
  if (input.recordId) return updateDnsRecord(input.zoneId, input.recordId, body);
  return createDnsRecord(input.zoneId, body);
}

export async function findDdnsRecord(zoneId: string, name: string, type: "A" | "AAAA"): Promise<unknown> {
  const result = await listDnsRecords(zoneId) as { result?: Array<{ id: string; name: string; type: string; content: string }> };
  return result.result?.find((record) => record.name === name && record.type === type) ?? null;
}
