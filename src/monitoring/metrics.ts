type CounterMap = Map<string, number>;
const requests: CounterMap = new Map();
const errors: CounterMap = new Map();
let startedAt = Date.now();

function key(method: string, path: string): string { return `${method} ${path}`; }
function inc(map: CounterMap, name: string): void { map.set(name, (map.get(name) ?? 0) + 1); }

export function recordRequest(method: string, path: string, status: number): void {
  inc(requests, key(method, path));
  if (status >= 500) inc(errors, key(method, path));
}

export function metricsText(): string {
  const lines = ["# HELP ftn_http_requests_total Total HTTP requests.", "# TYPE ftn_http_requests_total counter"];
  for (const [name, value] of requests) lines.push(`ftn_http_requests_total{route="${escapeLabel(name)}"} ${value}`);
  lines.push("# HELP ftn_http_errors_total Total HTTP 5xx responses.", "# TYPE ftn_http_errors_total counter");
  for (const [name, value] of errors) lines.push(`ftn_http_errors_total{route="${escapeLabel(name)}"} ${value}`);
  lines.push(`# HELP ftn_process_uptime_seconds Process uptime in seconds.`, "# TYPE ftn_process_uptime_seconds gauge", `ftn_process_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`);
  return `${lines.join("\n")}\n`;
}

export function resetMetrics(): void { requests.clear(); errors.clear(); startedAt = Date.now(); }
function escapeLabel(value: string): string { return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"'); }
