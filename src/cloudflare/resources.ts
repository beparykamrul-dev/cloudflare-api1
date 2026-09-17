import { accountId, createCloudflareClient, requireEnv } from "./client.js";

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

type ApiEnvelope<T> = { success: boolean; result?: T; errors?: unknown[]; messages?: unknown[] };

async function accountList(path: string): Promise<unknown> {
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  const body = await response.json() as ApiEnvelope<unknown>;
  if (!response.ok || !body.success) throw new Error(`cloudflare_api_${response.status}`);
  return body;
}

export const listR2Buckets = () => accountList("/r2/buckets");
export const listD1Databases = () => accountList("/d1/database");
export const listKvNamespaces = () => accountList("/storage/kv/namespaces");
export const listQueues = () => accountList("/queues");
export const listVectorizeIndexes = () => accountList("/vectorize/indexes");
export const listHyperdriveConfigs = () => accountList("/hyperdrive/configs");
export const listAiGateways = () => accountList("/ai-gateway/gateways");
export const listContainers = () => accountList("/workers/containers");

export async function listZoneWorkerRoutes(zoneId: string): Promise<unknown> {
  const cf = createCloudflareClient();
  const workers = (cf as unknown as { workers?: { routes: { list: (params: { zone_id: string }) => Promise<unknown> } } }).workers;
  if (!workers) throw new Error("cloudflare_worker_routes_api_unavailable");
  return workers.routes.list({ zone_id: zoneId });
}
