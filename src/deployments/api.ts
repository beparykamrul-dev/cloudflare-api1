import { randomUUID } from "node:crypto";
import { authorize } from "../auth/authorize.js";
import { writeAudit } from "../audit/store.js";
import type { RequestContext } from "../audit/context.js";
import { getDb } from "../db/client.js";
import { enqueueDeployment, getDeployment, listDeployments, transitionDeployment } from "./queue.js";
import { dispatchDeploymentWorkflow, verifyGitHubWebhookSignature } from "./github-actions.js";
import { persistDeployment, listPersistedDeployments } from "./store.js";
import type { DeploymentEnvironment } from "./types.js";

const environments = new Set<DeploymentEnvironment>(["development", "staging", "production"]);

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function serviceExists(serviceId: string): Promise<boolean> {
  const result = await getDb().query("SELECT 1 FROM ftn_services WHERE service_id=$1 LIMIT 1", [serviceId]);
  return result.rowCount === 1;
}

async function audit(context: RequestContext | undefined, actorId: string, action: string, result: string, deploymentId: string, metadata: Record<string, unknown> = {}): Promise<void> {
  if (!context) return;
  try {
    await writeAudit({ requestId: context.requestId, actorId, action, result, deploymentId, resource: `deployment:${deploymentId}`, metadata });
  } catch (error) {
    console.error(JSON.stringify({ event: "audit_write_failed", request_id: context.requestId, action, deployment_id: deploymentId, error: error instanceof Error ? error.message : "unknown_error" }));
  }
}

export async function handleDeploymentApi(
  req: { method?: string; headers: Record<string, string | string[] | undefined> },
  pathname: string,
  body?: Record<string, unknown>,
  context?: RequestContext
): Promise<{ status: number; body: unknown } | null> {
  if (pathname === "/api/deployments" && req.method === "GET") {
    if (!authorize(req, "deployments:read")) return { status: 401, body: { error: "unauthorized" } };
    const rows = await listPersistedDeployments(Number(body?.limit ?? 100));
    return { status: 200, body: { deployments: rows } };
  }

  if (pathname === "/api/deployments" && req.method === "POST") {
    const principal = authorize(req, "deployments:write");
    if (!principal) return { status: 401, body: { error: "unauthorized" } };
    const serviceId = text(body?.serviceId);
    const repository = text(body?.repository);
    const commitSha = text(body?.commitSha);
    const environment = text(body?.environment) as DeploymentEnvironment | undefined;
    if (!serviceId || !repository || !commitSha || !environment || !environments.has(environment)) return { status: 400, body: { error: "invalid_deployment_request" } };
    if (!/^[-\w.]+\/[-\w.]+$/.test(repository)) return { status: 400, body: { error: "invalid_repository" } };
    if (!/^[0-9a-f]{7,64}$/i.test(commitSha) && commitSha !== "HEAD") return { status: 400, body: { error: "invalid_commit_sha" } };
    if (!(await serviceExists(serviceId))) return { status: 404, body: { error: "service_not_registered" } };
    if (environment === "production" && process.env.FTN_PRODUCTION_APPROVAL_REQUIRED === "true" && body?.approved !== true) return { status: 409, body: { error: "production_approval_required" } };

    const record = enqueueDeployment({ serviceId, repository, commitSha, environment, requestedBy: principal.id });
    await persistDeployment(record);
    await audit(context, principal.id, "deployment.created", "success", record.id, { serviceId, repository, commitSha, environment });
    try {
      await dispatchDeploymentWorkflow({ repository, ref: commitSha, environment, deploymentId: record.id });
      const running = transitionDeployment(record.id, "running");
      if (running) await persistDeployment(running);
      return { status: 202, body: { deployment: running ?? record } };
    } catch (error) {
      const failed = transitionDeployment(record.id, "failed", error instanceof Error ? error.message : "workflow_dispatch_failed");
      if (failed) await persistDeployment(failed);
      await audit(context, principal.id, "deployment.dispatch", "failed", record.id, { serviceId, environment });
      return { status: 502, body: { error: "workflow_dispatch_failed", deployment: failed ?? record } };
    }
  }

  const match = pathname.match(/^\/api\/deployments\/([^/]+)$/);
  if (match && req.method === "GET") {
    if (!authorize(req, "deployments:read")) return { status: 401, body: { error: "unauthorized" } };
    const id = match[1];
    const live = getDeployment(id);
    if (live) return { status: 200, body: { deployment: live } };
    const rows = await getDb().query("SELECT deployment_id, service_id, environment, commit_sha, version, actor_id, status, health_status, started_at, finished_at, metadata FROM ftn_deployments WHERE deployment_id=$1", [id]);
    if (!rows.rowCount) return { status: 404, body: { error: "deployment_not_found" } };
    return { status: 200, body: { deployment: rows.rows[0] } };
  }

  const cancel = pathname.match(/^\/api\/deployments\/([^/]+)\/cancel$/);
  if (cancel && req.method === "POST") {
    const principal = authorize(req, "deployments:write");
    if (!principal) return { status: 401, body: { error: "unauthorized" } };
    const record = getDeployment(cancel[1]);
    if (!record) return { status: 404, body: { error: "deployment_not_found" } };
    if (!["queued", "running"].includes(record.status)) return { status: 409, body: { error: "deployment_not_cancellable" } };
    const result = transitionDeployment(record.id, "cancelled");
    if (result) {
      await persistDeployment(result);
      await audit(context, principal.id, "deployment.cancelled", "success", result.id, { serviceId: result.serviceId, environment: result.environment });
    }
    return { status: 200, body: { deployment: result } };
  }

  if (pathname === "/api/webhooks/deployment-status" && req.method === "POST") return { status: 400, body: { error: "raw_body_required" } };
  return null;
}

export function listQueuedDeployments() { return listDeployments(); }

export async function handleDeploymentStatusCallback(
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
  context?: RequestContext
): Promise<{ status: number; body: unknown }> {
  const signature = Array.isArray(headers["x-ftn-signature-256"]) ? headers["x-ftn-signature-256"][0] : headers["x-ftn-signature-256"];
  if (!verifyGitHubWebhookSignature(rawBody, signature, process.env.FTN_DEPLOY_CALLBACK_SECRET ?? process.env.GITHUB_WEBHOOK_SECRET)) return { status: 401, body: { error: "invalid_signature" } };
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; } catch { return { status: 400, body: { error: "invalid_json_body" } }; }
  const deploymentId = text(payload.deployment_id);
  const status = text(payload.status);
  if (!deploymentId || !status || !["succeeded", "failed", "cancelled", "rolled_back"].includes(status)) return { status: 400, body: { error: "invalid_status_callback" } };
  const result = await getDb().query("UPDATE ftn_deployments SET status=$2, health_status=$3, version=COALESCE($4,version), finished_at=CASE WHEN $2 IN ('succeeded','failed','cancelled','rolled_back') THEN now() ELSE finished_at END, metadata=metadata || $5::jsonb WHERE deployment_id=$1 RETURNING deployment_id, service_id, environment, status, health_status, version, finished_at", [deploymentId, status, text(payload.health_status) ?? null, text(payload.version) ?? null, JSON.stringify({ callback: true, error: text(payload.error) ?? null })]);
  if (!result.rowCount) return { status: 404, body: { error: "deployment_not_found" } };
  const row = result.rows[0] as { service_id?: string; environment?: string; status?: string };
  await audit(context, "github-webhook", "deployment.callback", "success", deploymentId, { serviceId: row.service_id, environment: row.environment, status: row.status });
  return { status: 200, body: { deployment: row } };
}

export function newDeploymentId(): string { return randomUUID(); }
