import type pg from "pg";
import { env } from "../../config/env.js";
import type { Connection, HealthStatus } from "../../db/schema.js";
import { connectionRepository } from "../../repositories/connection.repository.js";
import type { CreateConnectionInput, TestConnectionInput, UpdateConnectionInput } from "../../schemas/connection.schema.js";
import { decrypt, encrypt } from "../../utils/crypto.js";
import { AppError, conflict, notFound } from "../../utils/errors.js";
import { logActivity } from "../activity.service.js";
import { translatePgError } from "./pg-errors.js";
import { disposePools, getPool, openClient, type PgConnectionConfig } from "./pool-manager.js";

/** The API shape of a connection. Never includes the password. */
export function toPublicConnection(connection: Connection) {
  const { passwordEncrypted: _omit, userId: _userId, ...rest } = connection;
  return rest;
}
export type PublicConnection = ReturnType<typeof toPublicConnection>;

export interface ConnectionTestResult {
  ok: boolean;
  status: HealthStatus;
  latencyMs: number | null;
  serverVersion: string | null;
  database: string | null;
  error: string | null;
  checkedAt: string;
}

function configFromConnection(connection: Connection, database?: string): PgConnectionConfig {
  return {
    host: connection.host,
    port: connection.port,
    database: database ?? connection.database,
    username: connection.username,
    password: decrypt(connection.passwordEncrypted),
    sslMode: connection.sslMode,
  };
}

async function runTest(config: PgConnectionConfig): Promise<ConnectionTestResult> {
  const checkedAt = new Date().toISOString();
  let client: pg.Client | undefined;
  try {
    client = await openClient(config);
    const started = performance.now();
    await client.query("select 1");
    const latencyMs = Math.round(performance.now() - started);
    const { rows } = await client.query<{ version: string; db: string }>(
      "select current_setting('server_version') as version, current_database() as db",
    );
    return {
      ok: true,
      status: latencyMs > env.DEGRADED_LATENCY_MS ? "DEGRADED" : "CONNECTED",
      latencyMs,
      serverVersion: rows[0]?.version ?? null,
      database: rows[0]?.db ?? null,
      error: null,
      checkedAt,
    };
  } catch (error) {
    const friendly = translatePgError(error, "connect");
    return { ok: false, status: "DISCONNECTED", latencyMs: null, serverVersion: null, database: null, error: friendly.message, checkedAt };
  } finally {
    await client?.end().catch(() => undefined);
  }
}

export const connectionService = {
  async list(userId: string) {
    const rows = await connectionRepository.listByUser(userId);
    return rows.map(toPublicConnection);
  },

  async getOwned(userId: string, id: string): Promise<Connection> {
    const connection = await connectionRepository.findForUser(userId, id);
    if (!connection) throw notFound("Connection not found. It may have been deleted.");
    return connection;
  },

  async get(userId: string, id: string) {
    return toPublicConnection(await this.getOwned(userId, id));
  },

  async create(userId: string, input: CreateConnectionInput) {
    const { password, ...fields } = input;
    try {
      const created = await connectionRepository.create({ ...fields, userId, passwordEncrypted: encrypt(password) });
      await logActivity(userId, {
        action: "CONNECTION_CREATED",
        entityType: "connection",
        entityId: created.id,
        entityName: created.name,
        message: `Added PostgreSQL connection "${created.name}" (${created.host}:${created.port}/${created.database})`,
      });
      // Verify immediately so the list shows real health, not a guess.
      await this.test(userId, created.id);
      return this.get(userId, created.id);
    } catch (error) {
      if ((error as { code?: string; cause?: { code?: string } }).cause?.code === "23505" || (error as { code?: string }).code === "23505") {
        throw conflict(`A connection named "${input.name}" already exists.`);
      }
      throw error;
    }
  },

  async update(userId: string, id: string, input: UpdateConnectionInput) {
    const existing = await this.getOwned(userId, id);
    const { password, ...fields } = input;
    const updated = await connectionRepository.update(userId, id, {
      ...fields,
      ...(password ? { passwordEncrypted: encrypt(password) } : {}),
      healthStatus: "UNKNOWN",
    });
    if (!updated) throw notFound("Connection not found.");
    await disposePools(`${id}:`);
    await logActivity(userId, {
      action: "CONNECTION_UPDATED",
      entityType: "connection",
      entityId: id,
      entityName: updated.name,
      message: `Updated PostgreSQL connection "${existing.name}"`,
    });
    await this.test(userId, id);
    return this.get(userId, id);
  },

  async remove(userId: string, id: string) {
    const existing = await this.getOwned(userId, id);
    await connectionRepository.delete(userId, id);
    await disposePools(`${id}:`);
    await logActivity(userId, {
      action: "CONNECTION_DELETED",
      entityType: "connection",
      entityId: id,
      entityName: existing.name,
      message: `Deleted PostgreSQL connection "${existing.name}" and its sync configurations`,
    });
  },

  /** Tests a saved connection and records the verified health. */
  async test(userId: string, id: string): Promise<ConnectionTestResult> {
    const connection = await this.getOwned(userId, id);
    const result = await runTest(configFromConnection(connection));
    await connectionRepository.update(userId, id, {
      healthStatus: result.status,
      lastLatencyMs: result.latencyMs,
      lastError: result.error,
      lastCheckedAt: new Date(result.checkedAt),
      ...(result.serverVersion ? { serverVersion: result.serverVersion } : {}),
    });
    await logActivity(userId, {
      action: "CONNECTION_TESTED",
      status: result.ok ? "SUCCESS" : "FAILURE",
      entityType: "connection",
      entityId: id,
      entityName: connection.name,
      message: result.ok
        ? `Connection "${connection.name}" verified (${result.latencyMs} ms)`
        : `Connection "${connection.name}" failed: ${result.error}`,
    });
    return result;
  },

  /** Tests a configuration from the form before it is saved. */
  async testUnsaved(userId: string, input: TestConnectionInput): Promise<ConnectionTestResult> {
    let password = input.password;
    if (!password && input.connectionId) {
      password = decrypt((await this.getOwned(userId, input.connectionId)).passwordEncrypted);
    }
    return runTest({ ...input, password });
  },

  /** A pooled client for a user's connection (optionally a different database on the same server). */
  async poolFor(userId: string, id: string, database?: string): Promise<pg.Pool> {
    const connection = await this.getOwned(userId, id);
    const config = configFromConnection(connection, database);
    try {
      return await getPool(`${id}:${config.database}:${connection.updatedAt.getTime()}`, config);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw translatePgError(error, "connect");
    }
  },
};
