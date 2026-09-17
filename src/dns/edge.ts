export type EdgeProvider = "cloudflare" | "ftn" | "external";

export interface EdgeEndpoint {
  id: string;
  provider: EdgeProvider;
  hostname: string;
  region?: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface EdgeRoute {
  hostname: string;
  endpoints: EdgeEndpoint[];
  strategy: "failover" | "weighted" | "latency";
}

export function validateEdgeRoute(route: EdgeRoute): EdgeRoute {
  if (!route.hostname || !route.endpoints.length) throw new Error("invalid_edge_route");
  if (new Set(route.endpoints.map((endpoint) => endpoint.id)).size !== route.endpoints.length) throw new Error("duplicate_edge_endpoint");
  return route;
}
