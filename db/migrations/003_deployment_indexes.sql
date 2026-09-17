CREATE INDEX IF NOT EXISTS idx_ftn_deployments_status_started
  ON ftn_deployments(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ftn_deployments_commit
  ON ftn_deployments(commit_sha);
