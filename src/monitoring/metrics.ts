type CounterMap = Map<string, number>;
type Histogram = { count: number; sum: number; buckets: Map<number, number> };

const requests: CounterMap = new Map();
const errors: CounterMap = new Map();
const latency: Map<string, Histogram> = new Map();
const deployments: CounterMap = new Map();
const deploymentDuration: Map<string, Histogram> = new Map();
const alertTransitions: CounterMap = new Map();
const activeAlerts: CounterMap = new Map();
let startedAt = Date.now();
const latencyBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const deploymentBuckets = [1, 5, 10, 30, 60, 120, 300, 600, 1800];

function key(method: string, path: string): string { return `${method} ${path}`; }
function inc(map: CounterMap, name: string): void { map.set(name, (map.get(name) ?? 0) + 1); }
function histogram(store: Map<string, Histogram>, name: string, buckets: number[]): Histogram {
  let item = store.get(name);
  if (!item) { item = { count: 0, sum: 0, buckets: new Map(buckets.map((b) => [b, 0])) }; store.set(name, item); }
  return item;
}

export function recordRequest(method: string, path: string, status: number, durationSeconds = 0): void {
  const name = key(method, path);
  inc(requests, name);
  if (status >= 500) inc(errors, name);
  const h = histogram(latency, name, latencyBuckets);
  h.count += 1;
  h.sum += Math.max(0, durationSeconds);
  for (const bucket of latencyBuckets) if (durationSeconds <= bucket) h.buckets.set(bucket, (h.buckets.get(bucket) ?? 0) + 1);
}

export function recordDeployment(environment: string, status: string, durationSeconds?: number): void {
  const name = `${environment}|${status}`;
  inc(deployments, name);
  if (durationSeconds !== undefined && Number.isFinite(durationSeconds)) {
    const h = histogram(deploymentDuration, environment, deploymentBuckets);
    h.count += 1;
    h.sum += Math.max(0, durationSeconds);
    for (const bucket of deploymentBuckets) if (durationSeconds <= bucket) h.buckets.set(bucket, (h.buckets.get(bucket) ?? 0) + 1);
  }
}

export function recordAlertTransition(rule: string, severity: "warning" | "critical", state: "firing" | "resolved"): void {
  inc(alertTransitions, `${rule}|${severity}|${state}`);
  const current = activeAlerts.get(severity) ?? 0;
  activeAlerts.set(severity, state === "firing" ? current + 1 : Math.max(0, current - 1));
}

export function setActiveAlertCounts(counts: { warning: number; critical: number }): void {
  activeAlerts.set("warning", Math.max(0, Math.floor(counts.warning)));
  activeAlerts.set("critical", Math.max(0, Math.floor(counts.critical)));
}

export function metricsText(): string {
  const lines = ["# HELP ftn_http_requests_total Total HTTP requests.", "# TYPE ftn_http_requests_total counter"];
  for (const [name, value] of requests) lines.push(`ftn_http_requests_total{route="${escapeLabel(name)}"} ${value}`);
  lines.push("# HELP ftn_http_errors_total Total HTTP 5xx responses.", "# TYPE ftn_http_errors_total counter");
  for (const [name, value] of errors) lines.push(`ftn_http_errors_total{route="${escapeLabel(name)}"} ${value}`);

  lines.push("# HELP ftn_deployments_total Deployment transitions recorded by environment and status.", "# TYPE ftn_deployments_total counter");
  for (const [name, value] of deployments) {
    const [environment, status] = name.split("|");
    lines.push(`ftn_deployments_total{environment="${escapeLabel(environment)}",status="${escapeLabel(status)}"} ${value}`);
  }

  lines.push("# HELP ftn_deployment_duration_seconds Deployment duration in seconds.", "# TYPE ftn_deployment_duration_seconds histogram");
  for (const [environment, h] of deploymentDuration) {
    for (const bucket of deploymentBuckets) lines.push(`ftn_deployment_duration_seconds_bucket{environment="${escapeLabel(environment)}",le="${bucket}"} ${h.buckets.get(bucket) ?? 0}`);
    lines.push(`ftn_deployment_duration_seconds_bucket{environment="${escapeLabel(environment)}",le="+Inf"} ${h.count}`);
    lines.push(`ftn_deployment_duration_seconds_sum{environment="${escapeLabel(environment)}"} ${h.sum}`);
    lines.push(`ftn_deployment_duration_seconds_count{environment="${escapeLabel(environment)}"} ${h.count}`);
  }

  lines.push("# HELP ftn_alert_transitions_total Alert state transitions.", "# TYPE ftn_alert_transitions_total counter");
  for (const [name, value] of alertTransitions) {
    const [rule, severity, state] = name.split("|");
    lines.push(`ftn_alert_transitions_total{rule="${escapeLabel(rule)}",severity="${escapeLabel(severity)}",state="${escapeLabel(state)}"} ${value}`);
  }
  lines.push("# HELP ftn_alerts_active Active alerts by severity.", "# TYPE ftn_alerts_active gauge");
  for (const severity of ["warning", "critical"]) lines.push(`ftn_alerts_active{severity="${severity}"} ${activeAlerts.get(severity) ?? 0}`);

  lines.push("# HELP ftn_http_request_duration_seconds HTTP request duration in seconds.", "# TYPE ftn_http_request_duration_seconds histogram");
  for (const [name, h] of latency) {
    for (const bucket of latencyBuckets) lines.push(`ftn_http_request_duration_seconds_bucket{route="${escapeLabel(name)}",le="${bucket}"} ${h.buckets.get(bucket) ?? 0}`);
    lines.push(`ftn_http_request_duration_seconds_bucket{route="${escapeLabel(name)}",le="+Inf"} ${h.count}`);
    lines.push(`ftn_http_request_duration_seconds_sum{route="${escapeLabel(name)}"} ${h.sum}`);
    lines.push(`ftn_http_request_duration_seconds_count{route="${escapeLabel(name)}"} ${h.count}`);
  }
  lines.push("# HELP ftn_process_uptime_seconds Process uptime in seconds.", "# TYPE ftn_process_uptime_seconds gauge", `ftn_process_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`);
  return `${lines.join("\n")}\n`;
}

export function resetMetrics(): void { requests.clear(); errors.clear(); latency.clear(); deployments.clear(); deploymentDuration.clear(); alertTransitions.clear(); activeAlerts.clear(); startedAt = Date.now(); }
function escapeLabel(value: string): string { return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"'); }
