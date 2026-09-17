import test from "node:test";
import assert from "node:assert/strict";
import { allowRequest } from "../src/security/rate-limit.js";

test("rate limiter returns structured state and blocks after the configured limit", () => {
  const originalMax = process.env.FTN_RATE_LIMIT_MAX;
  const originalWindow = process.env.FTN_RATE_LIMIT_WINDOW_MS;
  process.env.FTN_RATE_LIMIT_MAX = "2";
  process.env.FTN_RATE_LIMIT_WINDOW_MS = "60000";

  try {
    const key = `test-${Date.now()}-${Math.random()}`;
    const first = allowRequest(key);
    const second = allowRequest(key);
    const third = allowRequest(key);

    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 1);
    assert.equal(second.allowed, true);
    assert.equal(second.remaining, 0);
    assert.equal(third.allowed, false);
    assert.equal(third.remaining, 0);
    assert.ok(third.retryAfter >= 1);
  } finally {
    if (originalMax === undefined) delete process.env.FTN_RATE_LIMIT_MAX;
    else process.env.FTN_RATE_LIMIT_MAX = originalMax;
    if (originalWindow === undefined) delete process.env.FTN_RATE_LIMIT_WINDOW_MS;
    else process.env.FTN_RATE_LIMIT_WINDOW_MS = originalWindow;
  }
});
