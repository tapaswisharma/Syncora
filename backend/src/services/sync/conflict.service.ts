import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  syncConfigurations,
  syncConflicts,
  syncRowStates,
  type ConflictStrategy,
  type ConflictType,
} from "../../db/schema.js";
import { AppError, notFound } from "../../utils/errors.js";
import { logActivity } from "../activity.service.js";
import { applySheetChanges } from "./postgres-to-sheets.service.js";
import { applyPostgresChanges } from "./sheets-to-postgres.service.js";
import { loadContext, readPostgres, readSheet } from "./sync-context.js";
import type { PlannedConflict, Side, SyncPlan } from "./types.js";
import { rowHash } from "./value-codec.js";

/**
 * Picks the winning side for a conflict, or null when it must be resolved by a person.
 * LAST_WRITE_WINS compares the row's PostgreSQL timestamp column with the spreadsheet's last
 * modification time (Google does not expose per-row edit times).
 */
export function chooseResolution(input: {
  strategy: ConflictStrategy;
  type: ConflictType;
  postgresUpdatedAt: Date | null;
  sheetModifiedAt: Date | null;
}): Side | null {
  switch (input.strategy) {
    case "POSTGRES_WINS":
      return "POSTGRES";
    case "GOOGLE_SHEETS_WINS":
      return "SHEETS";
    case "MANUAL":
      return null;
    case "LAST_WRITE_WINS": {
      // A deletion has no timestamp; keeping the edited row is the safe choice.
      if (input.type === "DELETE_UPDATE") return "SHEETS";
      if (input.type === "UPDATE_DELETE") return "POSTGRES";
      if (!input.postgresUpdatedAt || !input.sheetModifiedAt) return null;
      return input.postgresUpdatedAt.getTime() >= input.sheetModifiedAt.getTime() ? "POSTGRES" : "SHEETS";
    }
  }
}

/** Stores conflicts from a run. An existing open conflict for the same row is refreshed, not duplicated. */
export async function recordConflicts(
  userId: string,
  configId: string,
  runId: string,
  strategy: ConflictStrategy,
  conflicts: PlannedConflict[],
): Promise<void> {
  if (!conflicts.length) return;
  const db = getDb();
  const keys = conflicts.map((conflict) => conflict.key);
  const open = await db
    .select({ id: syncConflicts.id, rowKey: syncConflicts.rowKey })
    .from(syncConflicts)
    .where(and(eq(syncConflicts.syncConfigurationId, configId), eq(syncConflicts.status, "OPEN"), inArray(syncConflicts.rowKey, keys)));
  const openByKey = new Map(open.map((row) => [row.rowKey, row.id]));

  for (const conflict of conflicts) {
    const values = {
      syncRunId: runId,
      type: conflict.type,
      strategy,
      status: conflict.resolution ? ("RESOLVED_AUTO" as const) : ("OPEN" as const),
      resolution: conflict.resolution,
      postgresValues: conflict.postgres,
      sheetValues: conflict.sheets,
      message: conflict.resolution
        ? `${conflict.message} Resolved automatically: kept the ${conflict.resolution === "POSTGRES" ? "PostgreSQL" : "Google Sheets"} version (${strategy}).`
        : `${conflict.message} Waiting for manual review.`,
      resolvedAt: conflict.resolution ? new Date() : null,
    };
    const existing = openByKey.get(conflict.key);
    if (existing) await db.update(syncConflicts).set(values).where(eq(syncConflicts.id, existing));
    else await db.insert(syncConflicts).values({ userId, syncConfigurationId: configId, rowKey: conflict.key, ...values });
  }
}

export const conflictService = {
  async list(userId: string, options: { status?: "OPEN" | "RESOLVED"; syncId?: string; limit: number }) {
    const conditions = [eq(syncConflicts.userId, userId)];
    if (options.syncId) conditions.push(eq(syncConflicts.syncConfigurationId, options.syncId));
    if (options.status === "OPEN") conditions.push(eq(syncConflicts.status, "OPEN"));
    if (options.status === "RESOLVED") conditions.push(inArray(syncConflicts.status, ["RESOLVED_AUTO", "RESOLVED_MANUAL", "DISMISSED"]));
    return getDb()
      .select({
        conflict: syncConflicts,
        syncName: syncConfigurations.name,
        tableName: syncConfigurations.tableName,
        schemaName: syncConfigurations.schemaName,
        keyColumn: syncConfigurations.keyColumn,
        worksheetTitle: syncConfigurations.worksheetTitle,
      })
      .from(syncConflicts)
      .innerJoin(syncConfigurations, eq(syncConfigurations.id, syncConflicts.syncConfigurationId))
      .where(and(...conditions))
      .orderBy(desc(syncConflicts.createdAt))
      .limit(options.limit)
      .then((rows) => rows.map(({ conflict, ...rest }) => ({ ...conflict, ...rest })));
  },

  async countOpen(userId: string): Promise<number> {
    const rows = await getDb()
      .select({ id: syncConflicts.id })
      .from(syncConflicts)
      .where(and(eq(syncConflicts.userId, userId), eq(syncConflicts.status, "OPEN")));
    return rows.length;
  },

  /** Applies the chosen side's *current* version of the row to the other side and records the decision. */
  async resolve(userId: string, conflictId: string, choice: Side | "DISMISS") {
    const db = getDb();
    const [conflict] = await db
      .select()
      .from(syncConflicts)
      .where(and(eq(syncConflicts.id, conflictId), eq(syncConflicts.userId, userId)));
    if (!conflict) throw notFound("Conflict not found.");
    if (conflict.status !== "OPEN") throw new AppError(409, "CONFLICT", "This conflict has already been resolved.");

    const [config] = await db
      .select()
      .from(syncConfigurations)
      .where(and(eq(syncConfigurations.id, conflict.syncConfigurationId), eq(syncConfigurations.userId, userId)));
    if (!config) throw notFound("The sync for this conflict no longer exists.");

    if (choice === "DISMISS") {
      await db.update(syncConflicts).set({ status: "DISMISSED", resolvedAt: new Date() }).where(eq(syncConflicts.id, conflictId));
      return { status: "DISMISSED" as const };
    }

    const context = await loadContext(userId, config);
    const [pg, sheet] = await Promise.all([readPostgres(context), readSheet(context)]);
    const key = conflict.rowKey;
    const pgRow = pg.rows.get(key);
    const sheetRef = sheet.rows.get(key);
    const empty: SyncPlan["sheets"] = { inserts: [], updates: [], deletes: [] };
    const emptyPg: SyncPlan["postgres"] = { inserts: [], updates: [], deletes: [] };
    let finalHash: string | null;

    if (choice === "POSTGRES") {
      const changes = { ...empty };
      if (pgRow && sheetRef) changes.updates = [{ key, rowNumber: sheetRef.rowNumber, row: pgRow }];
      else if (pgRow) changes.inserts = [{ key, row: pgRow }];
      else if (sheetRef) changes.deletes = [{ key, rowNumber: sheetRef.rowNumber }];
      const result = await applySheetChanges(context, sheet, changes);
      if (result.failed.size) throw new AppError(502, "GOOGLE_API_ERROR", [...result.failed.values()][0]!);
      finalHash = pgRow ? rowHash(pgRow, context.columnNames) : null;
    } else {
      const changes = { ...emptyPg };
      if (sheetRef && pgRow) changes.updates = [{ key, row: sheetRef.row }];
      else if (sheetRef) changes.inserts = [{ key, row: sheetRef.row }];
      else if (pgRow) changes.deletes = [{ key }];
      const result = await applyPostgresChanges(context, changes);
      if (result.failed.size) throw new AppError(400, "PG_QUERY_FAILED", [...result.failed.values()][0]!);
      finalHash = sheetRef ? rowHash(sheetRef.row, context.columnNames) : null;
    }

    const stateWhere = and(eq(syncRowStates.syncConfigurationId, config.id), eq(syncRowStates.rowKey, key));
    if (finalHash) {
      await db
        .insert(syncRowStates)
        .values({ syncConfigurationId: config.id, rowKey: key, rowHash: finalHash })
        .onConflictDoUpdate({ target: [syncRowStates.syncConfigurationId, syncRowStates.rowKey], set: { rowHash: finalHash, syncedAt: new Date() } });
    } else {
      await db.delete(syncRowStates).where(stateWhere);
    }

    await db
      .update(syncConflicts)
      .set({ status: "RESOLVED_MANUAL", resolution: choice, resolvedAt: new Date() })
      .where(eq(syncConflicts.id, conflictId));
    await logActivity(userId, {
      action: "CONFLICT_RESOLVED",
      entityType: "conflict",
      entityId: conflictId,
      entityName: config.name,
      message: `Resolved conflict on ${config.keyColumn}=${key} in "${config.name}" by keeping the ${choice === "POSTGRES" ? "PostgreSQL" : "Google Sheets"} version`,
    });
    return { status: "RESOLVED_MANUAL" as const };
  },
};
