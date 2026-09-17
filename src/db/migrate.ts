import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getDb } from "./client.js";

const db = getDb();
await db.query(`CREATE TABLE IF NOT EXISTS ftn_schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
const dir = join(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
for (const file of files) {
  const version = file.split("_")[0];
  const exists = await db.query("SELECT 1 FROM ftn_schema_migrations WHERE version=$1", [version]);
  if (exists.rowCount) continue;
  const sql = await readFile(join(dir, file), "utf8");
  await db.query("BEGIN");
  try {
    await db.query(sql);
    await db.query("INSERT INTO ftn_schema_migrations(version) VALUES($1)", [version]);
    await db.query("COMMIT");
    console.log(`migration applied: ${file}`);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
await db.end();
