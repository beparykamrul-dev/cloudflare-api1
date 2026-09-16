import { accountId, createCloudflareClient } from "../cloudflare/client.js";

export type InventoryItem = {
  provider: "cloudflare";
  resourceType: string;
  resourceId: string;
  name?: string;
  scope: string;
  observedAt: string;
};

export async function discoverInventory(): Promise<InventoryItem[]> {
  const client = createCloudflareClient();
  const observedAt = new Date().toISOString();
  const items: InventoryItem[] = [];

  const account = accountId();
  items.push({ provider: "cloudflare", resourceType: "account", resourceId: account, scope: "account", observedAt });

  for await (const zone of client.zones.list()) {
    items.push({
      provider: "cloudflare",
      resourceType: "zone",
      resourceId: zone.id,
      name: zone.name ?? undefined,
      scope: `account:${account}`,
      observedAt,
    });
  }

  return items;
}
