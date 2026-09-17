const ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;

export function validateCloudflareIdentifier(value: string | undefined, field: string): string | null {
  if (!value || !ID_PATTERN.test(value)) return `invalid_${field}`;
  return null;
}

const DNS_FIELDS = new Set(["type", "name", "content", "ttl", "proxied", "priority", "data", "comment", "tags"]);

export function validateDnsRecordBody(body: Record<string, unknown>): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_dns_record_body";
  if (Object.keys(body).some((key) => !DNS_FIELDS.has(key))) return "invalid_dns_record_field";
  if (typeof body.type !== "string" || !body.type.trim()) return "invalid_dns_record_type";
  if (typeof body.name !== "string" || !body.name.trim()) return "invalid_dns_record_name";
  if (typeof body.content !== "string" || !body.content.trim()) return "invalid_dns_record_content";
  if (body.ttl !== undefined && (!Number.isInteger(body.ttl) || Number(body.ttl) < 1)) return "invalid_dns_record_ttl";
  if (body.proxied !== undefined && typeof body.proxied !== "boolean") return "invalid_dns_record_proxied";
  if (body.priority !== undefined && (!Number.isInteger(body.priority) || Number(body.priority) < 0)) return "invalid_dns_record_priority";
  return null;
}

export function normalizeCloudflareError(error: unknown): { status: number; error: string } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("401") || message.includes("unauthorized")) return { status: 401, error: "cloudflare_unauthorized" };
    if (message.includes("403") || message.includes("forbidden")) return { status: 403, error: "cloudflare_forbidden" };
    if (message.includes("404") || message.includes("not found")) return { status: 404, error: "cloudflare_not_found" };
    if (message.includes("429") || message.includes("rate limit")) return { status: 429, error: "cloudflare_rate_limited" };
  }
  return { status: 502, error: "cloudflare_request_failed" };
}
