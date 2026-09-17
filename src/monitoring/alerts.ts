import { persistAlert, listActiveAlerts } from "./alert-store.js";
import { recordAlertTransition, setActiveAlertCounts } from "./metrics.js";

export type AlertSeverity = "warning" | "critical";
export type AlertState = "firing" | "resolved";
export interface Alert { fingerprint: string; rule: string; severity: AlertSeverity; state: AlertState; message: string; updatedAt: string; }
const active = new Map<string, Alert>();

export async function hydrateAlerts(): Promise<void> {
  const persisted = await listActiveAlerts();
  active.clear();
  for (const alert of persisted) active.set(alert.fingerprint, {
    fingerprint: alert.fingerprint,
    rule: alert.rule,
    severity: alert.severity,
    state: alert.state,
    message: alert.message,
    updatedAt: alert.updatedAt
  });
  setActiveAlertCounts({
    warning: persisted.filter((alert) => alert.severity === "warning").length,
    critical: persisted.filter((alert) => alert.severity === "critical").length
  });
}

export async function evaluateReadiness(database: boolean, cloudflare: boolean): Promise<Alert[]> {
  const now = new Date().toISOString();
  const checks: Array<[string, boolean, AlertSeverity, string]> = [["database_unavailable", database, "critical", "Database readiness check failed"],["cloudflare_credentials_unavailable", cloudflare, "critical", "Cloudflare credential readiness check failed"]];
  const changed: Alert[] = [];
  for (const [rule, ok, severity, message] of checks) {
    const existing = active.get(rule);
    if (!ok && !existing) {
      const alert: Alert = { fingerprint: rule, rule, severity, state: "firing", message, updatedAt: now };
      active.set(rule, alert); changed.push(alert);
      await persistAlert(alert);
      recordAlertTransition(alert.rule, alert.severity, alert.state);
    } else if (ok && existing) {
      const resolved = { ...existing, state: "resolved" as const, updatedAt: now };
      active.delete(rule); changed.push(resolved);
      await persistAlert(resolved);
      recordAlertTransition(resolved.rule, resolved.severity, resolved.state);
    }
  }
  return changed;
}

export function listAlerts(): Alert[] { return [...active.values()]; }
export function resetAlerts(): void { active.clear(); setActiveAlertCounts({ warning: 0, critical: 0 }); }
