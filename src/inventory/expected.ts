import { getDb } from "../db/client.js";
import type { InventoryItem, ResourceType } from "./types.js";

export type ExpectedResource = {
  resourceKey: string;
  resourceType: ResourceType | string;
  resourceId: string;
  scope: string;
  environment: string;
  name?: string;
  source: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function rowToExpected(row: Record<string, unknown>): ExpectedResource {
  return {
    resourceKey: String(row.resource_key),
    resourceType: String(row.resource_type),
    resourceId: String(row.resource_id),
    scope: String(row.scope),
    environment: String(row.environment),
    name: row.name == null ? undefined : String(row.name),
    source: String(row.source),
    status: String(row.status),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function listExpectedResources(environment?: string): Promise<ExpectedResource[]> {
  const result = environment
    ? await getDb().query("SELECT * FROM ftn_inventory_expected WHERE environment=$1 AND status='active' ORDER BY resource_type, resource_id", [environment])
    : await getDb().query("SELECT * FROM ftn_inventory_expected WHERE status='active' ORDER BY resource_type, resource_id");
  return result.rows.map((row) => rowToExpected(row as Record<string, unknown>));
}

export async function upsertExpectedResource(input: {
  resourceType: string; resourceId: string; scope: string; environment?: string; name?: string; source?: string; metadata?: Record<string, unknown>;
}): Promise<ExpectedResource> {
  const resourceKey = `${input.resourceType}:${input.resourceId}`;
  const result = await getDb().query(
    "INSERT INTO ftn_inventory_expected(resource_key,resource_type,resource_id,scope,environment,name,source,status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8::jsonb) ON CONFLICT(resource_key) DO UPDATE SET scope=EXCLUDED.scope,environment=EXCLUDED.environment,name=EXCLUDED.name,source=EXCLUDED.source,metadata=EXCLUDED.metadata,status='active',updated_at=now() RETURNING *",
    [resourceKey, input.resourceType, input.resourceId, input.scope, input.environment ?? "global", input.name ?? null, input.source ?? "registry", JSON.stringify(input.metadata ?? {})]
  );
  return rowToExpected(result.rows[0] as Record<string, unknown>);
}

export async function archiveExpectedResource(resourceKey: string): Promise<boolean> {
  const result = await getDb().query(
    "UPDATE ftn_inventory_expected SET status='archived',updated_at=now() WHERE resource_key=$1 AND status='active' RETURNING resource_key",
    [resourceKey]
  );
  return result.rowCount === 1;
}

export function expectedToInventoryItem(item: ExpectedResource): InventoryItem {
  return {
    provider: "cloudflare",
    resourceType: item.resourceType,
    resourceId: item.resourceId,
    name: item.name,
    scope: item.scope,
    status: "ACTIVE",
    metadata: item.metadata,
    observedAt: item.updatedAt
  };
}
