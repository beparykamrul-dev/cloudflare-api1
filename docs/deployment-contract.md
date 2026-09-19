# FTN Deployment Contract

The control plane creates a deployment record and dispatches a GitHub Actions workflow in the target repository.

## Required workflow contract

The target repository must expose the workflow configured by `GITHUB_DEPLOY_WORKFLOW` (default: `deploy.yml`) and accept these `workflow_dispatch` inputs:

- `environment`: `development`, `staging`, or `production`
- `deployment_id`: the FTN deployment identifier

The workflow is responsible for build, tests, deployment to its target, and post-deployment health verification. The control plane does not execute arbitrary shell commands on the target host.

## Status callback

After deployment, the workflow should POST a JSON object to:

`POST /api/webhooks/deployment-status`

with header:

`X-FTN-Signature-256: sha256=<HMAC-SHA256>`

The HMAC secret is `FTN_DEPLOY_CALLBACK_SECRET` (or the fallback `GITHUB_WEBHOOK_SECRET`). The signed JSON body may contain:

```json
{
  "deployment_id": "...",
  "status": "succeeded",
  "health_status": "healthy",
  "version": "..."
}
```

Allowed terminal statuses are `succeeded`, `failed`, `cancelled`, and `rolled_back`.

## Rollback

Rollback is explicit. The caller must provide a known target commit SHA; the control plane never guesses a previous version and never performs destructive host-side rollback itself.

`POST /api/deployments/<deployment_id>/rollback`

Body:

```json
{
  "commitSha": "<known-good-commit>"
}
```

The target repository must be registered as an FTN service before a deployment can be created.

## Security

- Keep `GITHUB_ACTIONS_TOKEN` and callback secrets outside Git.
- Use a least-privilege GitHub token suitable for workflow dispatch.
- Protect production environments with GitHub environment approvals as an additional control.
- Do not put tokens, Authorization headers, or private keys in deployment metadata or audit logs.


## Immutable release execution

Each environment workflow builds and packages the exact checked-out commit. Before the signed status callback, the workflow executes the GitHub Environment secret `FTN_DEPLOY_COMMAND` on the runner. The command must deploy `$RELEASE_ARCHIVE` to the configured FTN target and must fail non-zero on deployment failure. It receives `$DEPLOYMENT_ID` and `$COMMIT_SHA` as environment variables.

Configure `FTN_DEPLOY_COMMAND`, `FTN_DEPLOY_CALLBACK_URL`, `FTN_DEPLOY_CALLBACK_SECRET`, and `FTN_DEPLOY_HEALTH_URL` separately in the dev, staging, and production GitHub Environments. Keep credentials inside the environment/secret store; never commit them.

The control plane records the deployment before dispatch and only accepts a signed callback for the registered service/repository/environment. A missing deployment command causes the workflow to fail instead of reporting a false successful deployment. No automatic destructive correction is performed.
