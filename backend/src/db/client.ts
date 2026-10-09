import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let database: Database | undefined;

function createPool(): pg.Pool {
  const created = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
  created.on("error", (error) => logger.error({ err: error }, "Metadata database pool error"));
  return created;
}

/** The application metadata database (Supabase Postgres in production). */
export function getDb(): Database {
  if (!env.DATABASE_URL) {
    throw new AppError(
      503,
      "NOT_CONFIGURED",
      "The DBSynchro metadata database is not configured. Set DATABASE_URL in backend/.env and run `npm run db:migrate`.",
    );
  }
  if (!database) {
    pool = createPool();
    database = drizzle(pool, { schema });
  }
  return database;
}

export async function pingDb(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!env.DATABASE_URL) return { ok: false, error: "DATABASE_URL is not set" };
  getDb();
  const started = performance.now();
  try {
    await pool!.query("select 1");
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    logger.warn({ err: error }, "Metadata database ping failed");
    return { ok: false, error: "Metadata database is unreachable" };
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  database = undefined;
}
