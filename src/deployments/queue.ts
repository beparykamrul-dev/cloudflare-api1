import { randomUUID } from "node:crypto";
import type { DeploymentRecord, DeploymentRequest, DeploymentStatus } from "./types.js";

const queue: DeploymentRecord[] = [];
const active = new Set<string>();
const terminalStatuses = new Set<DeploymentStatus>(["succeeded", "failed", "cancelled", "rolled_back"]);

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
  if (terminalStatuses.has(status)) {
    record.finishedAt = new Date().toISOString();
    active.delete(record.serviceId);
  }
  return record;
}

/**
 * Applies an authenticated external deployment callback to the in-memory record.
 * The database remains the source of truth; a missing local record is expected
 * after a restart or horizontal scaling and is therefore not an error.
 */
export function syncDeploymentCallback(
  id: string,
  status: DeploymentStatus,
  options: { error?: string; healthStatus?: string; version?: string } = {}
): DeploymentRecord | undefined {
  const record = getDeployment(id);
  if (!record) return undefined;
  if (!terminalStatuses.has(status)) throw new Error("invalid_terminal_status");
  if (terminalStatuses.has(record.status) && record.status !== status) throw new Error("deployment_already_terminal");

  record.status = status;
  if (options.error) record.error = options.error;
  if (options.version) record.version = options.version;
  if (options.healthStatus) record.healthStatus = options.healthStatus;
  record.finishedAt = record.finishedAt ?? new Date().toISOString();
  active.delete(record.serviceId);
  return record;
}
