import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import type { Alert } from "./alerts.js";

export async function persistAlert(alert: Alert): Promise<void> {
  const db = getDb();
  if (alert.state === "firing") {
    await db.query(
      `INSERT INTO ftn_alerts (id, fingerprint, rule, severity, state, message)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (fingerprint) WHERE state = 'firing'
       DO UPDATE SET last_seen_at=now(), message=EXCLUDED.message, severity=EXCLUDED.severity`,
      [randomUUID(), alert.fingerprint, alert.rule, alert.severity, alert.state, alert.message]
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

export async function listAlertHistory(limit = 100): Promise<unknown[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
  const result = await getDb().query(
    `SELECT id, fingerprint, rule, severity, state, message, first_seen_at, last_seen_at, resolved_at
     FROM ftn_alerts ORDER BY last_seen_at DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}
