export type AuditEvent = {
  id: string;
  requestId: string;
  actorId: string;
  service: string;
  environment: string;
  resource: string;
  action: string;
  result: "success" | "failure" | "denied";
  timestamp: string;
  commitSha?: string;
  deploymentId?: string;
};

export type DriftStatus = "MISSING" | "EXTRA" | "CHANGED" | "UNKNOWN" | "UNAUTHORIZED" | "IN_SYNC";

export type DriftItem = {
  resourceId: string;
  resourceType: string;
  status: DriftStatus;
  expected?: unknown;
  observed?: unknown;
};
