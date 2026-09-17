import type { DeploymentRecord } from "./types.js";
import { transitionDeployment } from "./queue.js";

const timeoutMs = Number(process.env.FTN_DEPLOYMENT_TIMEOUT_MS ?? 300_000);

export async function runDeployment(record: DeploymentRecord): Promise<DeploymentRecord> {
  transitionDeployment(record.id, "running");
  try {
    await Promise.race([
      execute(record),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("deployment_timeout")), timeoutMs))
    ]);
    return transitionDeployment(record.id, "succeeded")!;
  } catch (error) {
    return transitionDeployment(record.id, "failed", error instanceof Error ? error.message : "deployment_failed")!;
  }
}

async function execute(record: DeploymentRecord): Promise<void> {
  // Provider-specific execution is intentionally delegated to the next provider adapter layer.
  // The engine validates the deployment lifecycle without executing arbitrary shell commands.
  if (!record.repository || !record.commitSha || !record.serviceId) throw new Error("invalid_deployment_request");
}
