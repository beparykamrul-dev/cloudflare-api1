import { authorize } from "../auth/authorize.js";
import { listAlerts } from "./alerts.js";

export function handleMonitoringApi(req: { method?: string; headers: Record<string, string | string[] | undefined> }, pathname: string): { status: number; body: unknown } | null {
  if (req.method !== "GET") return null;
  if (pathname === "/api/monitoring/alerts") {
    if (!authorize(req, "inventory:read")) return { status: 401, body: { error: "unauthorized" } };
    return { status: 200, body: { alerts: listAlerts() } };
  }
  if (pathname === "/api/monitoring/summary") {
    if (!authorize(req, "inventory:read")) return { status: 401, body: { error: "unauthorized" } };
    const alerts = listAlerts();
    return { status: 200, body: { status: alerts.some((a) => a.severity === "critical") ? "critical" : alerts.length ? "warning" : "ok", active_alerts: alerts.length, alerts } };
  }
  return null;
}
