import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import type { Alert } from "./alerts.js";

export interface AlertHistoryItem extends Alert {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
}

function rowToAlert(row: Record<string, unknown>): AlertHistoryItem {
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    rule: String(row.rule),
    severity: row.severity as Alert["severity"],
    state: row.state as Alert["state"],
    message: String(row.message),
    updatedAt: new Date(String(row.last_seen_at)).toISOString(),
    firstSeenAt: new Date(String(row.first_seen_at)).toISOString(),
    lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
    ...(row.resolved_at ? { resolvedAt: new Date(String(row.resolved_at)).toISOString() } : {})
  };
}

export async function persistAlert(alert: Alert): Promise<void> {
  const db = getDb();
  if (alert.state === "firing") {
    await db.query(
      `INSERT INTO ftn_alerts (id, fingerprint, rule, severity, state, message)
       VALUES ($1,$2,$3,$4,'firing',$5)
       ON CONFLICT (fingerprint) WHERE state='firing'
       DO UPDATE SET rule=EXCLUDED.rule, severity=EXCLUDED.severity,
                     message=EXCLUDED.message, last_seen_at=now(), resolved_at=NULL`,
      [randomUUID(), alert.fingerprint, alert.rule, alert.severity, alert.message]
    );
    return;
  }

  await db.query(
    `UPDATE ftn_alerts
     SET state='resolved', last_seen_at=now(), resolved_at=now(), message=$2
     WHERE fingerprint=$1 AND state='firing'`,
    [alert.fingerprint, alert.message]
  );
}

export async function listActiveAlerts(): Promise<AlertHistoryItem[]> {
  const result = await getDb().query(
    `SELECT id, fingerprint, rule, severity, state, message, first_seen_at, last_seen_at, resolved_at
     FROM ftn_alerts WHERE state='firing' ORDER BY last_seen_at DESC`
  );
  return result.rows.map(rowToAlert);
}

export async function listAlertHistory(limit = 100): Promise<AlertHistoryItem[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
  const result = await getDb().query(
    `SELECT id, fingerprint, rule, severity, state, message, first_seen_at, last_seen_at, resolved_at
     FROM ftn_alerts ORDER BY last_seen_at DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(rowToAlert);
}
