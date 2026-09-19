import { accountId, createCloudflareClient, requireEnv } from "../cloudflare/client.js";
import type { InventoryItem, ResourceType } from "./types.js";

const API_BASE = "https://api.cloudflare.com/client/v4";
type ApiEnvelope<T> = { success: boolean; result?: T; result_info?: { total_pages?: number } };
type Resource = { id?: string; name?: string; uid?: string; title?: string; key?: string; [key: string]: unknown };

async function listApi(path: string): Promise<Resource[]> {
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const items: Resource[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`${API_BASE}${path}?page=${page}&per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) throw new Error(`cloudflare_inventory_unauthorized:${response.status}`);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Cloudflare API ${response.status} for ${path}`);
    const body = (await response.json()) as ApiEnvelope<Resource[] | Resource>;
    if (!body.success || body.result == null) return items;
    if (Array.isArray(body.result)) items.push(...body.result); else items.push(body.result);
    if (page >= (body.result_info?.total_pages ?? page) || !Array.isArray(body.result) || body.result.length === 0) break;
  }
  return items;
}

function add(items: InventoryItem[], resourceType: ResourceType, resources: Resource[], scope: string, observedAt: string) {
  for (const resource of resources) {
    const resourceId = String(resource.id ?? resource.uid ?? resource.key ?? resource.name ?? "");
    if (!resourceId) continue;
    items.push({
      provider: "cloudflare", resourceType, resourceId,
      name: typeof resource.name === "string" ? resource.name : typeof resource.title === "string" ? resource.title : undefined,
      scope, status: "ACTIVE", metadata: { discovered: true }, observedAt,
    });
  }
}

export async function discoverInventory(): Promise<InventoryItem[]> {
  const client = createCloudflareClient();
  const observedAt = new Date().toISOString();
  const items: InventoryItem[] = [];
  const account = accountId();
  const scope = `account:${account}`;
  items.push({ provider: "cloudflare", resourceType: "account", resourceId: account, scope: "account", status: "ACTIVE", observedAt });

  for await (const zone of client.zones.list()) {
    items.push({ provider: "cloudflare", resourceType: "zone", resourceId: zone.id, name: zone.name ?? undefined, scope, status: "ACTIVE", observedAt });
  }

  const resources: Array<[ResourceType, string]> = [
    ["worker", `/accounts/${account}/workers/scripts`],
    ["r2_bucket", `/accounts/${account}/r2/buckets`],
    ["d1_database", `/accounts/${account}/d1/database`],
    ["kv_namespace", `/accounts/${account}/storage/kv/namespaces`],
    ["queue", `/accounts/${account}/queues`],
    ["vectorize_index", `/accounts/${account}/vectorize/indexes`],
    ["hyperdrive", `/accounts/${account}/hyperdrive/configs`],
    ["ai_gateway", `/accounts/${account}/ai-gateway/gateways`],
    ["container", `/accounts/${account}/workers/containers`],
  ];

  for (const [type, path] of resources) {
    try { add(items, type, await listApi(path), scope, observedAt); }
    catch (error) { console.warn(JSON.stringify({ event: "inventory_family_failed", resource_type: type, message: error instanceof Error ? error.message : "unknown_error" })); }
  }
  return items;
}
