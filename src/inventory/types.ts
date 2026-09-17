export type ResourceType =
  | "account"
  | "zone"
  | "worker"
  | "route"
  | "r2_bucket"
  | "d1_database"
  | "kv_namespace"
  | "queue"
  | "vectorize_index"
  | "hyperdrive"
  | "ai_gateway"
  | "workers_ai"
  | "container"
  | "dns_record";

export type InventoryStatus = "ACTIVE" | "MISSING" | "EXTRA" | "CHANGED" | "UNKNOWN" | "UNAUTHORIZED";

export type InventoryItem = {
  provider: "cloudflare";
  resourceType: ResourceType | string;
  resourceId: string;
  name?: string;
  scope: string;
  status: InventoryStatus;
  metadata?: Record<string, unknown>;
  observedAt: string;
};
