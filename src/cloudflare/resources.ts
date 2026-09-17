import { accountId, createCloudflareClient } from "./client.js";

export interface ResourceResult<T = unknown> {
  success: boolean;
  result: T;
  errors?: unknown[];
  messages?: unknown[];
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

export async function listZones(): Promise<unknown> {
  const cf = createCloudflareClient();
  return call(() => cf.zones.list({}));
}

export async function getZone(zoneId: string): Promise<unknown> {
  const cf = createCloudflareClient();
  return call(() => (cf.zones.get as unknown as (id: string) => Promise<unknown>)(zoneId));
}

export async function listDnsRecords(zoneId: string): Promise<unknown> {
  const cf = createCloudflareClient();
  return call(() => cf.dns.records.list({ zone_id: zoneId }));
}

export async function createDnsRecord(zoneId: string, body: Record<string, unknown>): Promise<unknown> {
  const cf = createCloudflareClient();
  return call(() => cf.dns.records.create({ zone_id: zoneId, ...body } as never));
}

export async function updateDnsRecord(zoneId: string, recordId: string, body: Record<string, unknown>): Promise<unknown> {
  const cf = createCloudflareClient();
  return call(() => cf.dns.records.update(recordId, { zone_id: zoneId, ...body } as never));
}

export async function deleteDnsRecord(zoneId: string, recordId: string): Promise<unknown> {
  const cf = createCloudflareClient();
  return call(() => cf.dns.records.delete(recordId, { zone_id: zoneId }));
}

export async function listWorkers(): Promise<unknown> {
  const cf = createCloudflareClient();
  const workers = (cf.accounts as unknown as { workers?: { scripts: { list: (params: { account_id: string }) => Promise<unknown> } } }).workers;
  if (!workers) throw new Error("cloudflare_workers_api_unavailable");
  return call(() => workers.scripts.list({ account_id: accountId() }));
}

export async function getWorker(scriptName: string): Promise<unknown> {
  const cf = createCloudflareClient();
  const workers = (cf.accounts as unknown as { workers?: { scripts: { get: (name: string, params: { account_id: string }) => Promise<unknown> } } }).workers;
  if (!workers) throw new Error("cloudflare_workers_api_unavailable");
  return call(() => workers.scripts.get(scriptName, { account_id: accountId() }));
}
