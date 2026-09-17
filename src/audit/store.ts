import { getDb } from "../db/client.js";

export interface AuditInput {
  requestId?: string;
  actorId?: string;
  serviceId?: string;
  environment?: string;
  resource?: string;
  action: string;
  result: string;
  commitSha?: string;
  deploymentId?: string;
  metadata?: Record<string, unknown>;
}

const sensitive = /token|secret|password|authorization|private[_-]?key|api[_-]?key/i;
function safeMetadata(value: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitive.test(key)));
}

export async function writeAudit(input: AuditInput): Promise<void> {
  await getDb().query(
    `INSERT INTO ftn_audit_events
      (request_id, actor_id, service_id, environment, resource, action, result, commit_sha, deployment_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [input.requestId ?? null, input.actorId ?? null, input.serviceId ?? null, input.environment ?? null,
      input.resource ?? null, input.action, input.result, input.commitSha ?? null, input.deploymentId ?? null,
      JSON.stringify(safeMetadata(input.metadata))]
  );
}
