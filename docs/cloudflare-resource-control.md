# Cloudflare Resource Control

The FTN control plane exposes Cloudflare resource families through explicit, allowlisted read adapters. The API never acts as an unrestricted Cloudflare proxy.

## Read endpoints

| Family | Endpoint | Permission |
|---|---|---|
| Zones | `GET /api/cloudflare/zones` | `cloudflare:read` |
| Zone | `GET /api/cloudflare/zones/:zoneId` | `cloudflare:read` |
| DNS records | `GET /api/cloudflare/zones/:zoneId/dns-records` | `cloudflare:read` |
| Workers | `GET /api/cloudflare/workers` | `cloudflare:read` |
| Worker | `GET /api/cloudflare/workers/:name` | `cloudflare:read` |
| Worker routes | `GET /api/cloudflare/zones/:zoneId/worker-routes` | `cloudflare:read` |
| R2 | `GET /api/cloudflare/r2` | `cloudflare:read` |
| D1 | `GET /api/cloudflare/d1` | `cloudflare:read` |
| KV | `GET /api/cloudflare/kv` | `cloudflare:read` |
| Queues | `GET /api/cloudflare/queues` | `cloudflare:read` |
| Vectorize | `GET /api/cloudflare/vectorize` | `cloudflare:read` |
| Hyperdrive | `GET /api/cloudflare/hyperdrive` | `cloudflare:read` |
| AI Gateway | `GET /api/cloudflare/ai-gateway` | `cloudflare:read` |
| Containers | `GET /api/cloudflare/containers` | `cloudflare:read` |

## Mutation boundary

DNS record creation, update, and deletion require `cloudflare:write` and pass identifier/body validation before reaching the Cloudflare API. These operations are audited. The resource-family endpoints above are read-only.

## Control-panel integration contract

The browser control panel should consume these endpoints through the existing authenticated API helper and display them as resource families with:

- family filter/search;
- refresh and loading/error states;
- resource counts;
- compact status/name/ID rows;
- a detail view for the selected resource;
- no automatic mutation, deletion, or drift repair.

The panel must not expose Cloudflare API tokens or upstream credentials to the browser. Its local API token is an FTN control-plane token and should be scoped through FTN RBAC.

## Safety

Inventory and resource discovery are detection-first. Differences between expected and observed state must remain reviewable and non-destructive. Any future write adapter must be explicit, permission checked, validated, audited, and independently testable.
