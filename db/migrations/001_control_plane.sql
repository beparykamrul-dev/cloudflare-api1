CREATE TABLE IF NOT EXISTS ftn_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id TEXT NOT NULL UNIQUE,
  service_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  repository TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ftn_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT,
  account_id TEXT,
  environment TEXT,
  service_id TEXT REFERENCES ftn_services(service_id),
  scope TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_ftn_resources_status ON ftn_resources(status);
CREATE INDEX IF NOT EXISTS idx_ftn_resources_service ON ftn_resources(service_id);

CREATE TABLE IF NOT EXISTS ftn_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id TEXT NOT NULL UNIQUE,
  service_id TEXT REFERENCES ftn_services(service_id),
  environment TEXT NOT NULL,
  commit_sha TEXT,
  version TEXT,
  actor_id TEXT,
  status TEXT NOT NULL,
  health_status TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ftn_deployments_service_env ON ftn_deployments(service_id, environment);

CREATE TABLE IF NOT EXISTS ftn_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT,
  actor_id TEXT,
  service_id TEXT,
  environment TEXT,
  resource TEXT,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  commit_sha TEXT,
  deployment_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ftn_audit_created ON ftn_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ftn_audit_request ON ftn_audit_events(request_id);

CREATE TABLE IF NOT EXISTS ftn_inventory_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observed_at TIMESTAMPTZ NOT NULL,
  item_count INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ftn_inventory_snapshots_observed ON ftn_inventory_snapshots(observed_at DESC);
