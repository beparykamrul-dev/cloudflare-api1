import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { dispatchDeploymentWorkflow, verifyGitHubWebhookSignature } from "../src/deployments/github-actions.js";

test("GitHub webhook signature uses HMAC SHA-256", () => {
  const payload = Buffer.from('{"action":"completed"}');
  const secret = "test-secret";
  const digest = createHmac("sha256", secret).update(payload).digest("hex");

  assert.equal(verifyGitHubWebhookSignature(payload, `sha256=${digest}`, secret), true);
  assert.equal(verifyGitHubWebhookSignature(payload, `sha256=${digest.slice(0, -1)}0`, secret), false);
  assert.equal(verifyGitHubWebhookSignature(payload, "sha256=bad", secret), false);
  assert.equal(verifyGitHubWebhookSignature(payload, undefined, secret), false);
});

test("deployment workflow cannot be overridden across environments", async () => {
  const previousToken = process.env.GITHUB_ACTIONS_TOKEN;
  const previousWorkflow = process.env.GITHUB_DEPLOY_WORKFLOW;
  const previousFetch = globalThis.fetch;

  process.env.GITHUB_ACTIONS_TOKEN = "test-token";
  process.env.GITHUB_DEPLOY_WORKFLOW = "deploy-production.yml";
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };

  await assert.rejects(
    dispatchDeploymentWorkflow({
      repository: "owner/repo",
      ref: "main",
      environment: "staging",
      deploymentId: "dep-test"
    }),
    /workflow_mismatch/
  );

  globalThis.fetch = previousFetch;
  if (previousToken === undefined) delete process.env.GITHUB_ACTIONS_TOKEN;
  else process.env.GITHUB_ACTIONS_TOKEN = previousToken;
  if (previousWorkflow === undefined) delete process.env.GITHUB_DEPLOY_WORKFLOW;
  else process.env.GITHUB_DEPLOY_WORKFLOW = previousWorkflow;
});
