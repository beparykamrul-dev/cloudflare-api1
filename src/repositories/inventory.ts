import type { InventoryItem } from "../inventory/types.js";
import { getDb } from "../db/client.js";

export async function persistInventory(items: InventoryItem[], observedAt = new Date().toISOString()) {
  const db = getDb();
  await db.query("BEGIN");
  try {
    for (const item of items) {
      await db.query(`INSERT INTO ftn_resources(provider,resource_type,resource_id,resource_name,account_id,environment,scope,status,metadata,last_seen)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(provider,resource_type,resource_id) DO UPDATE SET resource_name=EXCLUDED.resource_name,account_id=EXCLUDED.account_id,environment=EXCLUDED.environment,scope=EXCLUDED.scope,status=EXCLUDED.status,metadata=EXCLUDED.metadata,last_seen=EXCLUDED.last_seen`,
        [item.provider,item.resourceType,item.resourceId,item.name,item.scope,item.scope,item.scope,item.status,item.metadata,observedAt]);
    }
    await db.query("INSERT INTO ftn_inventory_snapshots(observed_at,item_count) VALUES($1,$2)",[observedAt,items.length]);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK"); throw e; }
}

export async function listPersistedInventory() {
  const { rows } = await getDb().query("SELECT provider,resource_type AS \"resourceType\",resource_id AS \"resourceId\",resource_name AS name,scope,status,metadata,last_seen AS \"observedAt\" FROM ftn_resources ORDER BY resource_type,resource_name");
  return rows;
}
