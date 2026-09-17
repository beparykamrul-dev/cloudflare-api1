import test from "node:test";
import assert from "node:assert/strict";
import { detectDrift } from "../src/inventory/drift.js";

const resource = (id: string, name: string) => ({ provider: "cloudflare", resourceType: "zone" as const, resourceId: id, name, scope: "account", status: "ACTIVE" as const, metadata: {}, observedAt: new Date().toISOString() });

test("drift detects missing and extra resources without mutating inputs", () => {
  const expected = [resource("zone-a", "a.example")];
  const observed = [resource("zone-b", "b.example")];
  const result = detectDrift(expected, observed);
  assert.equal(result.find((x) => x.key === "zone:zone-a")?.status, "MISSING");
  assert.equal(result.find((x) => x.key === "zone:zone-b")?.status, "EXTRA");
  assert.equal(expected.length, 1);
  assert.equal(observed.length, 1);
});
