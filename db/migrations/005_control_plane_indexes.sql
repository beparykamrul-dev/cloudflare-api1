CREATE INDEX IF NOT EXISTS idx_ftn_deployments_started
  ON ftn_deployments(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ftn_deployments_service_env_started
  ON ftn_deployments(service_id, environment, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ftn_audit_actor_created
  ON ftn_audit_events(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ftn_audit_deployment_created
  ON ftn_audit_events(deployment_id, created_at DESC);
