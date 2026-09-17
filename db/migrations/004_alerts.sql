CREATE TABLE IF NOT EXISTS ftn_alerts (
  id UUID PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning','critical')),
  state TEXT NOT NULL CHECK (state IN ('firing','resolved')),
  message TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ftn_alerts_fingerprint_seen
  ON ftn_alerts (fingerprint, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_ftn_alerts_state_seen
  ON ftn_alerts (state, last_seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ftn_alerts_active_fingerprint
  ON ftn_alerts (fingerprint)
  WHERE state = 'firing';
