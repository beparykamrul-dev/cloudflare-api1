import { getDb } from "../db/client.js";
import type { DeploymentRecord } from "./types.js";

export async function persistDeployment(record: DeploymentRecord): Promise<void> {
  await getDb().query(
    `INSERT INTO ftn_deployments
      (deployment_id, service_id, environment, commit_sha, version, actor_id, status, started_at, finished_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     ON CONFLICT (deployment_id) DO UPDATE SET
       commit_sha=EXCLUDED.commit_sha,
       version=EXCLUDED.version,
       status=EXCLUDED.status,
       started_at=EXCLUDED.started_at,
       finished_at=EXCLUDED.finished_at,
       metadata=EXCLUDED.metadata`,
    [
      record.id,
      record.serviceId,
      record.environment,
      record.commitSha,
      record.commitSha,
      record.requestedBy,
      record.status,
      record.startedAt ? new Date(record.startedAt) : new Date(record.createdAt),
      record.finishedAt ? new Date(record.finishedAt) : null,
      JSON.stringify({
        repository: record.repository,
        error: record.error ? "deployment_failed" : null,
        ...(record.rollbackOf ? { rollback_of: record.rollbackOf } : {})
      })
    ]
  );
}

export async function listPersistedDeployments(limit = 100): Promise<unknown[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const result = await getDb().query(
    `SELECT deployment_id, service_id, environment, commit_sha, version, actor_id, status, health_status,
            started_at, finished_at, metadata
       FROM ftn_deployments ORDER BY started_at DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}


export async function acquireDeploymentLease(serviceId: string, environment: string, deploymentId: string, leaseSeconds = 900): Promise<boolean> {
  const seconds = Math.min(Math.max(Math.trunc(leaseSeconds), 30), 86400);
  const result = await getDb().query(
    `INSERT INTO ftn_deployment_locks (service_id, environment, deployment_id, lease_until)
     VALUES ($1,$2,$3,now() + ($4 * interval '1 second'))
     ON CONFLICT (service_id, environment) DO UPDATE
       SET deployment_id=EXCLUDED.deployment_id,
           lease_until=EXCLUDED.lease_until
       WHERE ftn_deployment_locks.lease_until <= now()
     RETURNING deployment_id`,
    [serviceId, environment, deploymentId, seconds]
  );
  return result.rowCount === 1;
}

export async function renewDeploymentLease(deploymentId: string, leaseSeconds = 900): Promise<boolean> {
  const seconds = Math.min(Math.max(Math.trunc(leaseSeconds), 30), 86400);
  const result = await getDb().query(
    "UPDATE ftn_deployment_locks SET lease_until=now() + ($2 * interval '1 second') WHERE deployment_id=$1 AND lease_until > now() RETURNING deployment_id",
    [deploymentId, seconds]
  );
  return result.rowCount === 1;
}

export async function releaseDeploymentLease(deploymentId: string): Promise<void> {
  await getDb().query("DELETE FROM ftn_deployment_locks WHERE deployment_id=$1", [deploymentId]);
}


export async function updateDeploymentMetadata(deploymentId: string, metadata: Record<string, unknown>): Promise<void> {
  await getDb().query(
    "UPDATE ftn_deployments SET metadata = metadata || $2::jsonb WHERE deployment_id=$1",
    [deploymentId, JSON.stringify(metadata)]
  );
}
