import { createHmac, timingSafeEqual } from "node:crypto";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_required`);
  return value;
}

export async function dispatchDeploymentWorkflow(input: {
  repository: string;
  ref: string;
  environment: "development" | "staging" | "production";
  deploymentId: string;
}): Promise<void> {
  const token = required("GITHUB_ACTIONS_TOKEN");
  const workflow = process.env.GITHUB_DEPLOY_WORKFLOW ?? "deploy.yml";
  const [owner, repo] = input.repository.split("/");
  if (!owner || !repo || input.repository.split("/").length !== 2) throw new Error("invalid_repository");
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: input.ref, inputs: { environment: input.environment, deployment_id: input.deploymentId } })
  });
  if (!response.ok) throw new Error(`github_workflow_dispatch_failed:${response.status}`);
}

export function verifyGitHubWebhookSignature(payload: string | Buffer, signature: string | undefined, secret = process.env.GITHUB_WEBHOOK_SECRET): boolean {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const supplied = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}
