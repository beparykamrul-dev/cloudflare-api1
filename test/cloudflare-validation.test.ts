import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCloudflareError, validateCloudflareIdentifier, validateDnsRecordBody } from "../src/cloudflare/validation.js";

test("cloudflare identifiers reject empty and unsafe path values", () => {
  assert.equal(validateCloudflareIdentifier("zone-123", "zone_id"), null);
  assert.equal(validateCloudflareIdentifier("", "zone_id"), "invalid_zone_id");
  assert.equal(validateCloudflareIdentifier("../secret", "zone_id"), "invalid_zone_id");
});

test("DNS record validation accepts supported fields and rejects unknown fields", () => {
  assert.equal(validateDnsRecordBody({ type: "A", name: "example.com", content: "192.0.2.1", ttl: 300, proxied: true }), null);
  assert.equal(validateDnsRecordBody({ type: "A", name: "example.com", content: "192.0.2.1", unsafe: "x" }), "invalid_dns_record_field");
  assert.equal(validateDnsRecordBody({ type: "A", name: "example.com", content: "192.0.2.1", ttl: 0 }), "invalid_dns_record_ttl");
});

test("Cloudflare errors normalize to safe client responses", () => {
  assert.deepEqual(normalizeCloudflareError(new Error("Request failed with status 403")), { status: 403, error: "cloudflare_forbidden" });
  assert.deepEqual(normalizeCloudflareError(new Error("unexpected upstream failure")), { status: 502, error: "cloudflare_request_failed" });
});
