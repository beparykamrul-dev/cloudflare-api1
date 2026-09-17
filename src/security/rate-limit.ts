type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();
const windowMs = Number(process.env.FTN_RATE_LIMIT_WINDOW_MS ?? 60_000);
const maxRequests = Number(process.env.FTN_RATE_LIMIT_MAX ?? 120);

export function rateLimitKey(req: { socket?: { remoteAddress?: string | undefined }; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (value?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown");
}

export function allowRequest(key: string): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, maxRequests - 1), retryAfter: Math.ceil(windowMs / 1000) };
  }
  current.count += 1;
  const allowed = current.count <= maxRequests;
  return { allowed, remaining: Math.max(0, maxRequests - current.count), retryAfter: Math.ceil((current.resetAt - now) / 1000) };
}
