import test from "node:test";
import assert from "node:assert/strict";
import { enqueueDeployment, syncDeploymentCallback, transitionDeployment } from "../src/deployments/queue.js";

test("deployment callback synchronizes a local running record and releases its lock", () => {
  const serviceId = `callback-test-${Date.now()}-${Math.random()}`;
  const record = enqueueDeployment({
    serviceId,
    repository: "beparykamrul-dev/example",
    commitSha: "abcdef1234567",
    environment: "development",
    requestedBy: "test"
  });
  transitionDeployment(record.id, "running");
  const synced = syncDeploymentCallback(record.id, "succeeded");

  assert.equal(synced?.status, "succeeded");
  assert.ok(synced?.finishedAt);

  const next = enqueueDeployment({
    serviceId,
    repository: "beparykamrul-dev/example",
    commitSha: "abcdef1234567",
    environment: "development",
    requestedBy: "test"
  });
  assert.doesNotThrow(() => transitionDeployment(next.id, "running"));
});

test("deployment callback is harmless when the local record is absent", () => {
  assert.equal(syncDeploymentCallback("missing-deployment", "succeeded"), undefined);
});
