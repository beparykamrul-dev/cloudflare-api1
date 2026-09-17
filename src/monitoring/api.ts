import { authorize } from "../auth/authorize.js";
import { listAlerts } from "./alerts.js";
import { listActiveAlerts, listAlertHistory } from "./alert-store.js";

export async function handleMonitoringApi(req: { method?: string; headers: Record<string, string | string[] | undefined> }, pathname: string, search?: URLSearchParams): Promise<{ status: number; body: unknown } | null> {
  if (req.method !== "GET") return null;
  if (!authorize(req, "inventory:read")) return { status: 401, body: { error: "unauthorized" } };

  if (pathname === "/api/monitoring/alerts") {
    const persisted = await listActiveAlerts();
    return { status: 200, body: { alerts: persisted.length ? persisted : listAlerts() } };
  }
  if (pathname === "/api/monitoring/alerts/history") {
    const rawLimit = Number(search?.get("limit") ?? "100");
    const limit = Number.isFinite(rawLimit) ? rawLimit : 100;
    return { status: 200, body: { alerts: await listAlertHistory(limit) } };
  }
  if (pathname === "/api/monitoring/summary") {
    const alerts = await listActiveAlerts();
    const current = alerts.length ? alerts : listAlerts();
    return { status: 200, body: { status: current.some((a) => a.severity === "critical") ? "critical" : current.length ? "warning" : "ok", active_alerts: current.length, alerts: current } };
  }
  return null;
}
