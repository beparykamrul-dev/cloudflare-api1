import { randomUUID } from "node:crypto";
import type { DeploymentRecord, DeploymentRequest, DeploymentStatus } from "./types.js";

const queue: DeploymentRecord[] = [];
const active = new Set<string>();

export function enqueueDeployment(input: DeploymentRequest): DeploymentRecord {
  const record: DeploymentRecord = { ...input, id: randomUUID(), status: "queued", createdAt: new Date().toISOString() };
  queue.push(record);
  return record;
}

export function getDeployment(id: string): DeploymentRecord | undefined {
  return queue.find((item) => item.id === id);
}

export function listDeployments(): DeploymentRecord[] {
  return [...queue];
}

export function transitionDeployment(id: string, status: DeploymentStatus, error?: string): DeploymentRecord | undefined {
  const record = getDeployment(id);
  if (!record) return undefined;
  if (status === "running") {
    if (active.has(record.serviceId)) throw new Error("deployment_locked");
    active.add(record.serviceId);
    record.startedAt = new Date().toISOString();
  }
  record.status = status;
  if (error) record.error = error;
  if (["succeeded", "failed", "cancelled", "rolled_back"].includes(status)) {
    record.finishedAt = new Date().toISOString();
    active.delete(record.serviceId);
  }
  return record;
}
