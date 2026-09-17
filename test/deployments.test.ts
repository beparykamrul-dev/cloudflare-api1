import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyGitHubWebhookSignature } from "../src/deployments/github-actions.js";

const secret = "test-deployment-secret";
const payload = JSON.stringify({ deployment_id: "dep-1", status: "succeeded" });

function signature(body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

test("deployment callback signature accepts an authentic payload", () => {
  assert.equal(verifyGitHubWebhookSignature(payload, signature(payload), secret), true);
});

test("deployment callback signature rejects a modified payload", () => {
  assert.equal(verifyGitHubWebhookSignature(`${payload}x`, signature(payload), secret), false);
});

test("deployment callback signature rejects missing or malformed signatures", () => {
  assert.equal(verifyGitHubWebhookSignature(payload, undefined, secret), false);
  assert.equal(verifyGitHubWebhookSignature(payload, "sha256=bad", secret), false);
});
