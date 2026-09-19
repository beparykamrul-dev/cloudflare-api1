import { randomUUID } from "node:crypto";
import { authorize } from "../auth/authorize.js";
import { writeAudit } from "../audit/store.js";
import type { RequestContext } from "../audit/context.js";
import { getDb } from "../db/client.js";
import { enqueueDeployment, getDeployment, listDeployments, syncDeploymentCallback, transitionDeployment } from "./queue.js";
import { dispatchDeploymentWorkflow, verifyGitHubWebhookSignature } from "./github-actions.js";
import { persistDeployment, listPersistedDeployments } from "./store.js";
import { recordDeployment } from "../monitoring/metrics.js";
import type { DeploymentEnvironment, DeploymentStatus } from "./types.js";

const environments = new Set<DeploymentEnvironment>(["development", "staging", "production"]);
const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "rolled_back"]);

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boundedLimit(value: string | undefined): number {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 500);
}

function validRepository(repository: string): boolean {
  return /^[-\w.]+\/[-\w.]+$/.test(repository);
}

async function serviceRepository(serviceId: string): Promise<string | null> {
  const result = await getDb().query(
    "SELECT repository FROM ftn_services WHERE service_id=$1 AND status='active' LIMIT 1",
    [serviceId]
  );
  if (result.rowCount !== 1) return null;
  const repository = result.rows[0]?.repository;
  return typeof repository === "string" && repository.trim() ? repository.trim() : null;
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
  context?: RequestContext,
  searchParams?: URLSearchParams
): Promise<{ status: number; body: unknown } | null> {
  if (pathname === "/api/deployments" && req.method === "GET") {
    if (!authorize(req, "deployments:read")) return { status: 401, body: { error: "unauthorized" } };
    const rows = await listPersistedDeployments(boundedLimit(searchParams?.get("limit") ?? undefined));
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
    if (!validRepository(repository)) return { status: 400, body: { error: "invalid_repository" } };
    if (!/^[0-9a-f]{7,64}$/i.test(commitSha) && commitSha !== "HEAD") return { status: 400, body: { error: "invalid_commit_sha" } };
    const registeredRepository = await serviceRepository(serviceId);
    if (!registeredRepository) return { status: 404, body: { error: "service_not_registered" } };
    if (!validRepository(registeredRepository) || registeredRepository !== repository) return { status: 409, body: { error: "repository_service_mismatch" } };
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

  const rollback = pathname.match(/^\/api\/deployments\/([^/]+)\/rollback$/);
  if (rollback && req.method === "POST") {
    const principal = authorize(req, "deployments:write");
    if (!principal) return { status: 401, body: { error: "unauthorized" } };
    const targetId = rollback[1];
    const result = await getDb().query(
      `SELECT deployment_id, service_id, environment, commit_sha, status, metadata
         FROM ftn_deployments WHERE deployment_id=$1`,
      [targetId]
    );
    if (!result.rowCount) return { status: 404, body: { error: "deployment_not_found" } };
    const target = result.rows[0] as {
      deployment_id: string;
      service_id: string;
      environment: DeploymentEnvironment;
      commit_sha: string;
      status: string;
      metadata?: Record<string, unknown>;
    };
    if (target.status !== "succeeded") return { status: 409, body: { error: "deployment_not_rollbackable" } };
    if (!environments.has(target.environment)) return { status: 409, body: { error: "invalid_deployment_environment" } };
    const registeredRepository = await serviceRepository(target.service_id);
    if (!registeredRepository) return { status: 404, body: { error: "service_not_registered" } };

    const repository = typeof target.metadata?.repository === "string" ? target.metadata.repository : undefined;
    if (!repository || !validRepository(repository)) return { status: 409, body: { error: "rollback_repository_unavailable" } };
    if (registeredRepository !== repository) return { status: 409, body: { error: "rollback_repository_mismatch" } };
    if (!/^[0-9a-f]{7,64}$/i.test(target.commit_sha) && target.commit_sha !== "HEAD") return { status: 409, body: { error: "rollback_commit_unavailable" } };
    if (target.environment === "production" && process.env.FTN_PRODUCTION_APPROVAL_REQUIRED === "true" && body?.approved !== true) return { status: 409, body: { error: "production_approval_required" } };

    const record = enqueueDeployment({
      serviceId: target.service_id,
      repository,
      commitSha: target.commit_sha,
      environment: target.environment,
      requestedBy: principal.id,
      rollbackOf: targetId
    });
    await persistDeployment(record);
    await audit(context, principal.id, "deployment.rollback", "success", record.id, {
      serviceId: target.service_id,
      environment: target.environment,
      rollbackOf: targetId,
      commitSha: target.commit_sha
    });
    try {
      await dispatchDeploymentWorkflow({ repository, ref: target.commit_sha, environment: target.environment, deploymentId: record.id });
      const running = transitionDeployment(record.id, "running");
      if (running) await persistDeployment(running);
      return { status: 202, body: { deployment: running ?? record, rollback_of: targetId } };
    } catch (error) {
      const failed = transitionDeployment(record.id, "failed", error instanceof Error ? error.message : "workflow_dispatch_failed");
      if (failed) await persistDeployment(failed);
      await audit(context, principal.id, "deployment.rollback.dispatch", "failed", record.id, { rollbackOf: targetId, environment: target.environment });
      return { status: 502, body: { error: "workflow_dispatch_failed", deployment: failed ?? record, rollback_of: targetId } };
    }
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
  const status = text(payload.status) as DeploymentStatus | undefined;
  if (!deploymentId || !status || !terminalStatuses.has(status)) return { status: 400, body: { error: "invalid_status_callback" } };

  const expectedRepository = text(payload.repository);
  const expectedServiceId = text(payload.service_id);
  const expectedEnvironment = text(payload.environment);
  const result = await getDb().query(
    `SELECT deployment_id, service_id, environment, commit_sha, status, health_status, version, metadata, started_at
       FROM ftn_deployments WHERE deployment_id=$1`,
    [deploymentId]
  );
  if (!result.rowCount) return { status: 404, body: { error: "deployment_not_found" } };
  const current = result.rows[0] as { service_id?: string; environment?: string; commit_sha?: string; status?: string; health_status?: string; version?: string; metadata?: Record<string, unknown>; started_at?: string | Date | null };
  const metadata = current.metadata ?? {};
  const repository = typeof metadata.repository === "string" ? metadata.repository : undefined;
  if (!expectedRepository || !expectedServiceId || !expectedEnvironment) return { status: 400, body: { error: "callback_identity_required" } };
  if (expectedRepository !== repository) return { status: 409, body: { error: "callback_repository_mismatch" } };
  if (expectedServiceId !== current.service_id) return { status: 409, body: { error: "callback_service_mismatch" } };
  if (expectedEnvironment !== current.environment) return { status: 409, body: { error: "callback_environment_mismatch" } };
  if (current.status && terminalStatuses.has(current.status) && current.status !== status) return { status: 409, body: { error: "deployment_already_terminal" } };

  const errorMessage = text(payload.error);
  const version = text(payload.version) ?? current.commit_sha ?? null;
  const updated = await getDb().query(
    `UPDATE ftn_deployments
        SET status=$2,
            health_status=COALESCE($3,health_status),
            version=COALESCE($4,version),
            finished_at=CASE WHEN $2 IN ('succeeded','failed','cancelled','rolled_back') THEN now() ELSE finished_at END,
            metadata=metadata || $5::jsonb
      WHERE deployment_id=$1
      RETURNING deployment_id, service_id, environment, status, health_status, version, finished_at`,
    [deploymentId, status, text(payload.health_status), version, JSON.stringify({ callback: true, error_reported: Boolean(errorMessage) })]
  );
  const row = updated.rows[0] as { service_id?: string; environment?: string; status?: string };

  const local = syncDeploymentCallback(deploymentId, status, { error: errorMessage ? "workflow_reported_error" : undefined });
  if (local && local.status === status) {
    const startedMs = current.started_at ? new Date(current.started_at).getTime() : undefined;
    const duration = startedMs !== undefined && Number.isFinite(startedMs) ? (Date.now() - startedMs) / 1000 : undefined;
    recordDeployment(local.environment, status, duration);
  }

  await audit(context, "github-webhook", "deployment.callback", "success", deploymentId, { serviceId: row.service_id, environment: row.environment, status: row.status });
  return { status: 200, body: { deployment: row } };
}

export function newDeploymentId(): string { return randomUUID(); }
