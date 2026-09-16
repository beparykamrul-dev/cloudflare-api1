# FTN Cloudflare API Control Plane

Production-oriented foundation for Family Time Network (FTN) Cloudflare automation.

## Scope

- Cloudflare API integration through environment secrets only
- Dev / staging / production configuration
- Non-destructive resource discovery and inventory normalization
- Health and readiness endpoints
- Deployment metadata and audit-event contracts
- Drift detection contracts without automatic destructive correction
- GitHub Actions CI, security checks, and environment-gated deployment workflow
- DDNS and Cloudflare service adapters as isolated modules

## Security

**Never commit a Cloudflare API token.** Cloudflare recommends API tokens and explicitly warns against storing token secrets in plaintext or checking them into repositories. urlCloudflare API authentication guidancehttps://developers.cloudflare.com/fundamentals/api/how-to/make-api-calls/

Required runtime variables:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
FTN_ENVIRONMENT
```

The token is read only from the process environment. It is never written to source, configuration, audit records, or logs.

## Local development

```bash
npm install
npm run typecheck
npm run build
npm start
```

Health endpoints:

- `/health`
- `/health/live`
- `/health/ready`

## Architecture

```text
GitHub
  -> CI / Security
  -> FTN Control Plane
       -> Auth / RBAC / Policy
       -> Deployment Manager
       -> Inventory / Discovery
       -> Audit
       -> Cloudflare adapter
            -> Cloudflare API
       -> Monitoring hooks

PostgreSQL is the intended durable control-plane store. This repository currently keeps persistence behind interfaces so database migration can be added without destructive changes.
```

## Non-destructive rule

Discovery and drift detection may report `MISSING`, `EXTRA`, `CHANGED`, `UNKNOWN`, or `UNAUTHORIZED`. They do not automatically delete or overwrite resources.
