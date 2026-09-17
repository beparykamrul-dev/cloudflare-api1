import { getDb } from "../db/client.js";

const SECRET_KEYS = /token|authorization|password|secret|private.?key|api.?key/i;
function sanitize(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,v]) => [k,SECRET_KEYS.test(k) ? "[REDACTED]" : sanitize(v)]));
}

export async function recordAudit(input:{requestId?:string;actorId?:string;serviceId?:string;environment?:string;resource?:string;action:string;result:string;commitSha?:string;deploymentId?:string;metadata?:Record<string,unknown>}) {
  await getDb().query(`INSERT INTO ftn_audit_events(request_id,actor_id,service_id,environment,resource,action,result,commit_sha,deployment_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [input.requestId ?? null,input.actorId ?? null,input.serviceId ?? null,input.environment ?? null,input.resource ?? null,input.action,input.result,input.commitSha ?? null,input.deploymentId ?? null,sanitize(input.metadata ?? {})]);
}

export async function listAudit(limit=100) { return (await getDb().query("SELECT * FROM ftn_audit_events ORDER BY created_at DESC LIMIT $1",[Math.min(Math.max(limit,1),500)])).rows; }
