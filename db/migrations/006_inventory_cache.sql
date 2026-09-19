CREATE TABLE IF NOT EXISTS ftn_inventory_cache (
  cache_key TEXT PRIMARY KEY,
  observed_at TIMESTAMPTZ NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ftn_inventory_cache_observed_at
  ON ftn_inventory_cache (observed_at DESC);
