import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { discoverInventory } from "./inventory/discovery.js";

const port = Number(process.env.PORT ?? 8080);
const environment = process.env.FTN_ENVIRONMENT ?? "development";

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const requestId = randomUUID();

  try {
    if (req.method === "GET" && url.pathname === "/health/live") {
      return json(res, 200, { status: "ok", service: "ftn-cloudflare-api", request_id: requestId });
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { status: "ok", environment, service: "ftn-cloudflare-api", request_id: requestId });
    }

    if (req.method === "GET" && url.pathname === "/health/ready") {
      const ready = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
      return json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready", request_id: requestId });
    }

    if (req.method === "GET" && url.pathname === "/api/inventory") {
      const inventory = await discoverInventory();
      return json(res, 200, { request_id: requestId, count: inventory.length, items: inventory });
    }

    return json(res, 404, { error: "not_found", request_id: requestId });
  } catch (error) {
    console.error(JSON.stringify({ request_id: requestId, error: error instanceof Error ? error.message : "unknown_error" }));
    return json(res, 500, { error: "internal_error", request_id: requestId });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`ftn-cloudflare-api listening on ${port}`);
});
