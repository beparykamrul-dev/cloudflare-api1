import type { DeploymentRecord } from "./types.js";
import { transitionDeployment } from "./queue.js";
import { persistDeployment } from "./store.js";
import { recordDeployment } from "../monitoring/metrics.js";

const timeoutMs = Number(process.env.FTN_DEPLOYMENT_TIMEOUT_MS ?? 300_000);

export async function runDeployment(record: DeploymentRecord): Promise<DeploymentRecord> {
  const started = Date.now();
  transitionDeployment(record.id, "running");
  await persistDeployment(record);
  recordDeployment(record.environment, "running");
  try {
    await Promise.race([
      execute(record),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("deployment_timeout")), timeoutMs))
    ]);
    const result = transitionDeployment(record.id, "succeeded")!;
    await persistDeployment(result);
    recordDeployment(result.environment, "succeeded", (Date.now() - started) / 1000);
    return result;
  } catch (error) {
    const result = transitionDeployment(record.id, "failed", error instanceof Error ? error.message : "deployment_failed")!;
    await persistDeployment(result);
    recordDeployment(result.environment, "failed", (Date.now() - started) / 1000);
    return result;
  }
}

async function execute(record: DeploymentRecord): Promise<void> {
  if (!record.repository || !record.commitSha || !record.serviceId) throw new Error("invalid_deployment_request");
  // Provider-specific execution remains behind an explicit adapter boundary.
  // No arbitrary shell commands are executed by the control plane.
}
