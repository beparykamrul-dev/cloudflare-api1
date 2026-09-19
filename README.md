# FTN Cloudflare API Control Plane

Production-oriented control-plane foundation for Family Time Network (FTN) Cloudflare automation, inventory, DNS/DDNS, deployments, audit and monitoring.

## Production surface

- REST API with request IDs, validation and bounded request bodies
- RBAC roles: `super_admin`, `admin`, `engineer`, `employee`, `user`, `service`
- Dedicated permissions for inventory, services, deployments, Cloudflare, DNS, audit and monitoring
- PostgreSQL-backed services, resources, deployments, audit events and alert history
- Cloudflare inventory/discovery with cache and non-destructive drift detection
- Cloudflare zone/DNS/Workers resource adapters
- DNS/DDNS and edge-policy modules
- GitHub Actions deployment dispatch with signed status callbacks
- Deployment lifecycle: queued → running → succeeded/failed/cancelled/rolled_back
- Production approval gate controlled by environment configuration
- Deployment and mutation audit events with recursive secret-key scrubbing
- Health: `/health`, `/health/live`, `/health/ready`
- Prometheus metrics: `/metrics`
- Monitoring API and browser control panel at `/panel`
- Security headers, bounded body size, proxy-aware rate limiting and bounded in-memory limiter state
- CI typecheck/build/test/config validation and Gitleaks/npm audit

## Configuration

Required in a real deployment:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
FTN_ENVIRONMENT
```

Optional security/runtime controls include:

```text
FTN_AUTH_ENABLED
FTN_TRUST_PROXY
FTN_MAX_BODY_BYTES
FTN_RATE_LIMIT_MAX
FTN_RATE_LIMIT_WINDOW_MS
FTN_RATE_LIMIT_MAX_BUCKETS
FTN_PRODUCTION_APPROVAL_REQUIRED
FTN_DEPLOYMENT_TIMEOUT_MS
FTN_DEPLOY_CALLBACK_SECRET
GITHUB_WEBHOOK_SECRET
GITHUB_ACTIONS_TOKEN
GITHUB_DEPLOY_WORKFLOW
```

**Never commit a Cloudflare API token, GitHub token, webhook secret, private key or password.** Runtime secrets stay outside source control and are excluded from audit metadata.

## Local development

```bash
npm install
npm run typecheck
npm run build
npm run test
npm run validate:config
npm start
```

For a local PostgreSQL-backed run, apply migrations with:

```bash
npm run db:migrate
```

## API overview

```text
GET  /health
GET  /health/live
GET  /health/ready
GET  /metrics
GET  /api/auth/me
GET  /api/services
GET  /api/audit
GET  /api/inventory
GET  /api/inventory/:scope
GET  /api/deployments?limit=100
POST /api/deployments
GET  /api/deployments/:id
POST /api/deployments/:id/cancel
POST /api/webhooks/deployment-status
GET  /api/monitoring/alerts
GET  /api/monitoring/alerts/history?limit=100
GET  /api/monitoring/summary
GET  /panel
```

Cloudflare and DNS mutation routes are intentionally exposed through allowlisted adapters rather than an unrestricted arbitrary Cloudflare proxy.

## Deployment lifecycle

```text
Git push
  -> GitHub Actions
  -> typecheck/build/test/security/config validation
  -> deployment dispatch
  -> development
  -> health
  -> staging
  -> health
  -> production approval
  -> production
  -> health
  -> live OR rollback
```

The API records deployment identity, service, environment, commit SHA, actor, status and health state. Signed callbacks are bound to an existing deployment and reject conflicting identity/status updates.

## PostgreSQL and migrations

PostgreSQL is the durable control-plane source of truth. Migrations are applied transactionally and tracked in `ftn_schema_migrations`. Existing migrations are not rewritten or deleted; new schema changes use new migration versions.

The migration runner also understands legacy numeric migration records so older installations are not accidentally re-applied.

## Drift and safety model

Discovery and drift detection may report:

```text
MISSING
EXTRA
CHANGED
UNKNOWN
UNAUTHORIZED
```

Detection is intentionally non-destructive. The control plane does **not** automatically delete, overwrite or “repair” an observed resource because it differs from expected state. Changes require an explicit authenticated mutation/deployment action.

## Verification

CI runs:

```bash
npm install
npm run typecheck
npm run build
npm run test
npm run validate:config
```

The security workflow additionally runs Gitleaks and `npm audit --audit-level=high`.

Repository-level CI/build verification does not imply that a production FTN host, PostgreSQL instance, Cloudflare account, GitHub environment, DNS provider or external deployment target is live. Those require the corresponding runtime credentials and infrastructure.


## One-command live start

After cloning and installing dependencies:

```bash
cp .env.example .env
# Fill DATABASE_URL, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and auth/deployment secrets.
npm install
npm run live
```

`npm run live` performs configuration validation, TypeScript production build, backward-compatible PostgreSQL migrations, and starts the API on `0.0.0.0:PORT`.

Health checks:
- `GET /health` — process health
- `GET /health/live` — liveness
- `GET /health/ready` — database + Cloudflare readiness
- `GET /metrics` — Prometheus metrics
- `GET /panel` — web control panel

Production requirements:
- Node.js 22+
- PostgreSQL
- Cloudflare account/token
- authentication enabled
- GitHub Actions credentials only when deployment dispatch is used

The application never performs destructive drift correction automatically. Keep production secrets outside Git and outside telemetry/audit metadata.
