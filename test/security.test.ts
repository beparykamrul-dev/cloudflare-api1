import test from "node:test";
import assert from "node:assert/strict";
import { allowRequest } from "../src/security/rate-limit.js";

test("rate limiter returns structured state and blocks after the configured default limit", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  const first = allowRequest(key);
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 119);
  assert.ok(first.retryAfter >= 1);

  let last = first;
  for (let i = 1; i < 120; i += 1) last = allowRequest(key);
  assert.equal(last.allowed, true);
  assert.equal(last.remaining, 0);

  const blocked = allowRequest(key);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter >= 1);
});
