import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getDb(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

export async function checkDb(): Promise<boolean> {
  try { await getDb().query("SELECT 1"); return true; }
  catch { return false; }
}
