CREATE TABLE IF NOT EXISTS ftn_api_tokens (
  id UUID PRIMARY KEY,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ftn_api_tokens_active
  ON ftn_api_tokens (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ftn_api_tokens_principal
  ON ftn_api_tokens (principal_id);
