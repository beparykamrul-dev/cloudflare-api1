CREATE TABLE IF NOT EXISTS ftn_inventory_expected (
  resource_key TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'global',
  name TEXT,
  source TEXT NOT NULL DEFAULT 'registry',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ftn_inventory_expected_type_scope
  ON ftn_inventory_expected (resource_type, scope);

CREATE INDEX IF NOT EXISTS idx_ftn_inventory_expected_environment
  ON ftn_inventory_expected (environment);

CREATE INDEX IF NOT EXISTS idx_ftn_inventory_expected_status
  ON ftn_inventory_expected (status);
