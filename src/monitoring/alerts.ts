import { persistAlert } from "./alert-store.js";
import { recordAlertTransition } from "./metrics.js";

export type AlertSeverity = "warning" | "critical";
export type AlertState = "firing" | "resolved";
export interface Alert { fingerprint: string; rule: string; severity: AlertSeverity; state: AlertState; message: string; updatedAt: string; }
const active = new Map<string, Alert>();

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
export function resetAlerts(): void { active.clear(); }
