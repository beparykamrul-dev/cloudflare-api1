export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  maxBuckets: number;
}

type Entry = { count: number; resetAt: number };

function readConfig(): RateLimitConfig {
  return {
    windowMs: Math.max(1_000, Number(process.env.FTN_RATE_LIMIT_WINDOW_MS ?? 60_000)),
    maxRequests: Math.max(1, Number(process.env.FTN_RATE_LIMIT_MAX ?? 120)),
    maxBuckets: Math.max(100, Number(process.env.FTN_RATE_LIMIT_MAX_BUCKETS ?? 10_000))
  };
}

export function createRateLimiter(config: RateLimitConfig = readConfig()) {
  const buckets = new Map<string, Entry>();
  let lastCleanup = 0;

  function cleanup(now: number): void {
    if (now - lastCleanup < Math.min(config.windowMs, 10_000) && buckets.size <= config.maxBuckets) return;
    lastCleanup = now;
    for (const [key, entry] of buckets) if (entry.resetAt <= now) buckets.delete(key);
    if (buckets.size > config.maxBuckets) {
      const excess = buckets.size - config.maxBuckets;
      let removed = 0;
      for (const key of buckets.keys()) {
        buckets.delete(key);
        if (++removed >= excess) break;
      }
    }
  }

  function allow(key: string): { allowed: boolean; remaining: number; retryAfter: number } {
    const now = Date.now();
    cleanup(now);
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + config.windowMs });
      return { allowed: true, remaining: Math.max(0, config.maxRequests - 1), retryAfter: Math.ceil(config.windowMs / 1000) };
    }
    current.count += 1;
    const allowed = current.count <= config.maxRequests;
    return { allowed, remaining: Math.max(0, config.maxRequests - current.count), retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }

  return { allow };
}

const defaultLimiter = createRateLimiter();

export function rateLimitKey(req: { socket?: { remoteAddress?: string | undefined }; headers: Record<string, string | string[] | undefined> }): string {
  if (process.env.FTN_TRUST_PROXY === "true") {
    const forwarded = req.headers["x-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (value?.trim()) return value.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function allowRequest(key: string): { allowed: boolean; remaining: number; retryAfter: number } {
  return defaultLimiter.allow(key);
}
