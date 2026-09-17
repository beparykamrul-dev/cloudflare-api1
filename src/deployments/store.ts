import { getDb } from "../db/client.js";
import type { DeploymentRecord } from "./types.js";

export async function persistDeployment(record: DeploymentRecord): Promise<void> {
  await getDb().query(
    `INSERT INTO ftn_deployments
      (deployment_id, service_id, environment, commit_sha, actor_id, status, started_at, finished_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (deployment_id) DO UPDATE SET
       status=EXCLUDED.status, started_at=EXCLUDED.started_at,
       finished_at=EXCLUDED.finished_at, metadata=EXCLUDED.metadata`,
    [record.id, record.serviceId, record.environment, record.commitSha, record.requestedBy, record.status,
      record.startedAt ? new Date(record.startedAt) : new Date(record.createdAt),
      record.finishedAt ? new Date(record.finishedAt) : null,
      JSON.stringify({ repository: record.repository, error: record.error ?? null })]
  );
}

export async function listPersistedDeployments(limit = 100): Promise<unknown[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const result = await getDb().query(
    `SELECT deployment_id, service_id, environment, commit_sha, actor_id, status, health_status,
            started_at, finished_at, metadata
       FROM ftn_deployments ORDER BY started_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows;
}
