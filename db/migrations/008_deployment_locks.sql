CREATE TABLE IF NOT EXISTS ftn_deployment_locks (
  service_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  deployment_id TEXT NOT NULL UNIQUE,
  lease_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_ftn_deployment_locks_lease
  ON ftn_deployment_locks(lease_until);
