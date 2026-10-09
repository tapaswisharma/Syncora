import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import pg from "pg";
import { env } from "../../config/env.js";
import type { SslMode } from "../../db/schema.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

export interface PgConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
}

/** Return date/time values as the server's text so they round-trip without timezone drift. */
const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    const passthrough = [1082, 1083, 1114, 1184, 1186, 1266];
    if (passthrough.includes(oid)) return (value: string) => value;
    return pg.types.getTypeParser(oid, format);
  },
} as pg.CustomTypesConfig;

function sslOption(mode: SslMode): pg.ClientConfig["ssl"] {
  if (mode === "disable") return false;
  if (mode === "require") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

function clientConfig(config: PgConnectionConfig): pg.PoolConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: sslOption(config.sslMode),
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 35_000,
    application_name: "DBSynchro",
    options: "-c TimeZone=UTC",
    types,
  };
}

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address.startsWith("127.") || address === "0.0.0.0") return true;
  if (address.startsWith("10.") || address.startsWith("192.168.") || address.startsWith("169.254.")) return true;
  const match = /^172\.(\d+)\./.exec(address);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  const lower = address.toLowerCase();
  return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

/**
 * In production DBSynchro refuses to connect to loopback/private addresses so a user cannot
 * use it to probe the API server's internal network. Override with ALLOW_PRIVATE_DB_HOSTS=true.
 */
export async function assertHostAllowed(host: string): Promise<void> {
  if (env.allowPrivateDbHosts) return;
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  } catch (error) {
    throw new AppError(400, "PG_CONNECTION_FAILED", "The PostgreSQL host could not be found. Check the hostname.", { cause: error });
  }
  if (addresses.some(isPrivateAddress)) {
    throw new AppError(400, "PG_CONNECTION_FAILED", "Connections to private or local network addresses are not allowed on this server.");
  }
}

/** Opens a one-off client (used for connection tests). Caller must call `end()`. */
export async function openClient(config: PgConnectionConfig): Promise<pg.Client> {
  await assertHostAllowed(config.host);
  const client = new pg.Client(clientConfig(config));
  client.on("error", (error) => logger.warn({ err: error }, "Test client error"));
  await client.connect();
  return client;
}

interface PoolEntry {
  pool: pg.Pool;
  lastUsed: number;
}

const pools = new Map<string, PoolEntry>();
const IDLE_POOL_TTL_MS = 10 * 60 * 1000;

/**
 * Pools for users' databases, keyed by connection id + database + version stamp so editing a
 * connection never reuses stale credentials.
 */
export async function getPool(cacheKey: string, config: PgConnectionConfig): Promise<pg.Pool> {
  const existing = pools.get(cacheKey);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.pool;
  }
  await assertHostAllowed(config.host);
  const pool = new pg.Pool({ ...clientConfig(config), max: 4, idleTimeoutMillis: 60_000 });
  pool.on("error", (error) => logger.warn({ err: error, cacheKey }, "User database pool error"));
  pools.set(cacheKey, { pool, lastUsed: Date.now() });
  return pool;
}

export async function disposePools(prefix: string): Promise<void> {
  const closing: Promise<void>[] = [];
  for (const [key, entry] of pools) {
    if (key.startsWith(prefix)) {
      pools.delete(key);
      closing.push(entry.pool.end().catch(() => undefined));
    }
  }
  await Promise.all(closing);
}

export async function disposeAllPools(): Promise<void> {
  await disposePools("");
}

const sweeper = setInterval(() => {
  const cutoff = Date.now() - IDLE_POOL_TTL_MS;
  for (const [key, entry] of pools) {
    if (entry.lastUsed < cutoff) {
      pools.delete(key);
      void entry.pool.end().catch(() => undefined);
    }
  }
}, 60_000);
sweeper.unref();
