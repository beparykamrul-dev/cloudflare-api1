import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";

export async function createDeployment(input:{serviceId?:string;environment:string;commitSha?:string;version?:string;actorId?:string}) {
  const deploymentId = randomUUID();
  await getDb().query(`INSERT INTO ftn_deployments(deployment_id,service_id,environment,commit_sha,version,actor_id,status) VALUES($1,$2,$3,$4,$5,$6,'queued')`,
    [deploymentId,input.serviceId ?? null,input.environment,input.commitSha ?? null,input.version ?? null,input.actorId ?? null]);
  return deploymentId;
}

export async function updateDeployment(deploymentId:string,status:string,healthStatus?:string) {
  await getDb().query(`UPDATE ftn_deployments SET status=$2,health_status=$3,finished_at=CASE WHEN $2 IN ('succeeded','failed','cancelled','rolled_back') THEN now() ELSE finished_at END WHERE deployment_id=$1`,[deploymentId,status,healthStatus ?? null]);
}

export async function listDeployments(limit=50) { return (await getDb().query("SELECT * FROM ftn_deployments ORDER BY started_at DESC LIMIT $1",[Math.min(Math.max(limit,1),200)])).rows; }
