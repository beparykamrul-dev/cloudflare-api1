export type DeploymentEnvironment = "development" | "staging" | "production";
export type DeploymentStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "rolled_back";

export interface DeploymentRequest {
  serviceId: string;
  repository: string;
  commitSha: string;
  environment: DeploymentEnvironment;
  requestedBy: string;
}

export interface DeploymentRecord extends DeploymentRequest {
  id: string;
  status: DeploymentStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  rollbackOf?: string;
}
