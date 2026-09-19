import type { InventoryItem } from "./types.js";
import { getDb } from "../db/client.js";

export interface InventorySnapshot {
  observedAt: string;
  items: InventoryItem[];
}

let snapshot: InventorySnapshot | null = null;

export function getInventorySnapshot() {
  return snapshot;
}

export function setInventorySnapshot(items: InventoryItem[]) {
  snapshot = { observedAt: new Date().toISOString(), items };
  return snapshot;
}

export async function loadInventorySnapshot(cacheKey = "cloudflare"): Promise<InventorySnapshot | null> {
  try {
    const result = await getDb().query(
      "SELECT observed_at, items FROM ftn_inventory_cache WHERE cache_key=$1 LIMIT 1",
      [cacheKey]
    );
    const row = result.rows[0] as { observed_at?: Date | string; items?: InventoryItem[] } | undefined;
    if (!row) return snapshot;
    const items = Array.isArray(row.items) ? row.items : [];
    snapshot = { observedAt: new Date(row.observed_at ?? Date.now()).toISOString(), items };
    return snapshot;
  } catch {
    return snapshot;
  }
}

export async function persistInventorySnapshot(value: InventorySnapshot, cacheKey = "cloudflare"): Promise<void> {
  try {
    await getDb().query(
      "INSERT INTO ftn_inventory_cache(cache_key, observed_at, items) VALUES($1,$2,$3::jsonb) ON CONFLICT(cache_key) DO UPDATE SET observed_at=EXCLUDED.observed_at, items=EXCLUDED.items, updated_at=now()",
      [cacheKey, value.observedAt, JSON.stringify(value.items)]
    );
  } catch (error) {
    console.warn(JSON.stringify({ event: "inventory_cache_persist_failed", error: error instanceof Error ? error.message : "unknown_error" }));
  }
}

export function clearInventorySnapshot() {
  snapshot = null;
}
