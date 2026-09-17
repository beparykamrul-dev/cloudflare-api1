import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../src/security/rate-limit.js";

test("rate limiter returns structured state and blocks after the configured limit", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2, maxBuckets: 100 });
  const key = `test-${Date.now()}-${Math.random()}`;
  const first = limiter.allow(key);
  const second = limiter.allow(key);
  const third = limiter.allow(key);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.ok(third.retryAfter >= 1);
});
