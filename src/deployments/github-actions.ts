import { createHmac, timingSafeEqual } from "node:crypto";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + "_required");
  return value;
}

function positiveTimeout(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("invalid_" + name);
  return Math.max(1_000, Math.floor(parsed));
}

export interface DeploymentWorkflowDispatch {
  workflow: string;
  dispatchedAt: string;
  runId?: number;
  runUrl?: string;
  runStatus?: string;
}

export async function dispatchDeploymentWorkflow(input: {
  repository: string;
  ref: string;
  environment: "development" | "staging" | "production";
  deploymentId: string;
}): Promise<DeploymentWorkflowDispatch> {
  const token = required("GITHUB_ACTIONS_TOKEN");
  const workflows = { development: "deploy-dev.yml", staging: "deploy-staging.yml", production: "deploy-production.yml" } as const;
  const configured = process.env.GITHUB_DEPLOY_WORKFLOW;
  if (configured && configured !== workflows[input.environment]) {
    throw new Error("workflow_mismatch");
  }
  const workflow = workflows[input.environment];
  const [owner, repo] = input.repository.split("/");
  if (!owner || !repo || input.repository.split("/").length !== 2) throw new Error("invalid_repository");
  const timeoutMs = positiveTimeout("github_actions_timeout_ms", process.env.GITHUB_ACTIONS_TIMEOUT_MS, 15_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ref: input.ref, inputs: { environment: input.environment, deployment_id: input.deploymentId } }),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("github_workflow_dispatch_timeout");
    throw new Error("github_workflow_dispatch_unreachable");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`github_workflow_dispatch_failed:${response.status}`);

  const dispatchedAt = new Date().toISOString();
  const run = await findDispatchedWorkflowRun({ owner, repo, workflow, ref: input.ref, token, after: dispatchedAt });
  return { workflow, dispatchedAt, ...run };
}

async function findDispatchedWorkflowRun(input: {
  owner: string;
  repo: string;
  workflow: string;
  ref: string;
  token: string;
  after: string;
}): Promise<{ runId?: number; runUrl?: string; runStatus?: string }> {
  const waitMs = positiveTimeout("github_workflow_run_lookup_timeout_ms", process.env.GITHUB_WORKFLOW_RUN_LOOKUP_TIMEOUT_MS, 8_000);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(4_000, Math.max(1_000, deadline - Date.now())));
    try {
      const params = new URLSearchParams({ event: "workflow_dispatch", per_page: "20" });
      if (input.ref !== "HEAD") params.set("branch", input.ref);
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/actions/workflows/${encodeURIComponent(input.workflow)}/runs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${input.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: controller.signal
      });
      if (response.ok) {
        const payload = await response.json() as { workflow_runs?: Array<{ id?: number; html_url?: string; status?: string; created_at?: string }> };
        const afterMs = new Date(input.after).getTime();
        const match = (payload.workflow_runs ?? []).find((run) => typeof run.id === "number" && typeof run.created_at === "string" && new Date(run.created_at).getTime() >= afterMs);
        if (match?.id) return { runId: match.id, runUrl: match.html_url, runStatus: match.status };
      }
    } catch {
      // Callback remains authoritative if run lookup is temporarily unavailable.
    } finally {
      clearTimeout(timeout);
    }
    const sleep = Math.min(750, Math.max(100, deadline - Date.now()));
    if (sleep > 0) await new Promise((resolve) => setTimeout(resolve, sleep));
  }
  return {};
}

export function verifyGitHubWebhookSignature(payload: string | Buffer, signature: string | undefined, secret = process.env.GITHUB_WEBHOOK_SECRET): boolean {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const supplied = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}
