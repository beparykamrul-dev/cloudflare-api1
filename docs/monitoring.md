# FTN Cloudflare API Monitoring

The API exposes Prometheus-compatible metrics at `/metrics`.

## Metrics

- `ftn_http_requests_total` — request count by route.
- `ftn_http_errors_total` — HTTP 5xx count by route.
- `ftn_http_request_duration_seconds` — request latency histogram.
- `ftn_process_uptime_seconds` — process uptime.

## Prometheus

Use `config/monitoring/prometheus.yml` as the baseline scrape configuration. Keep the target address aligned with the actual deployment network; the repository does not assume a particular Docker, Kubernetes, or Proxmox topology.

## Alerting

`config/monitoring/alerts.yml` contains baseline availability, 5xx-rate, p95-latency and p99-latency rules. Alert delivery (email, webhook, PagerDuty, etc.) remains an infrastructure concern and should be configured in the deployment's Prometheus/Alertmanager stack.

## Security

Do not expose `/metrics` publicly without network controls when the deployment environment requires restricted operational telemetry. Metrics must not contain tokens, request headers, secrets, request bodies, or customer data.
