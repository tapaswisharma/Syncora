import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  syncConfigurations,
  syncMappings,
  syncRuns,
  type SyncConfiguration,
  type SyncRun,
  type SyncRunDetails,
} from "../../db/schema.js";
import type { SyncConfigInput, UpdateSyncConfigInput, ValidateSyncInput } from "../../schemas/sync.schema.js";
import { AppError, errorMessage, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { logActivity } from "../activity.service.js";
import { sheetsService } from "../google/sheets.service.js";
import { connectionService } from "../postgres/connection.service.js";
import { introspectionService } from "../postgres/introspection.service.js";
import { recordConflicts } from "./conflict.service.js";
import { validateMapping, writesToPostgres, writesToSheets, type MappingValidationResult } from "./mapping.service.js";
import { applySheetChanges } from "./postgres-to-sheets.service.js";
import { applyPostgresChanges, insertBlankKeyRows } from "./sheets-to-postgres.service.js";
import { planSummary, planSync } from "./sync-planner.js";
import { syncRunService } from "./sync-run.service.js";
import { loadBaseline, loadContext, loadMappings, readPostgres, readSheet, saveBaseline, type SyncContext } from "./sync-context.js";
import type { SyncPlan } from "./types.js";
import { rowHash } from "./value-codec.js";

const activeRuns = new Set<string>();

async function getOwnedConfig(userId: string, id: string): Promise<SyncConfiguration> {
  const [config] = await getDb()
    .select()
    .from(syncConfigurations)
    .where(and(eq(syncConfigurations.id, id), eq(syncConfigurations.userId, userId)));
  if (!config) throw notFound("Sync configuration not found.");
  return config;
}

async function validateAgainstSources(userId: string, input: ValidateSyncInput): Promise<MappingValidationResult> {
  const pool = await connectionService.poolFor(userId, input.connectionId, input.databaseName ?? undefined);
  const table = await introspectionService.getTable(pool, input.schemaName, input.tableName);
  let sheetHeaders: string[] | null = null;
  const extraErrors: string[] = [];
  try {
    const worksheet = await sheetsService.getWorksheet(userId, input.spreadsheetId, input.worksheetId);
    sheetHeaders = (await sheetsService.readWorksheet(userId, input.spreadsheetId, worksheet.title, 1)).headers;
  } catch (error) {
    extraErrors.push(errorMessage(error));
  }
  const result = validateMapping({
    mappings: input.mappings,
    table,
    keyColumn: input.keyColumn,
    direction: input.direction,
    strategy: input.conflictStrategy,
    timestampColumn: input.timestampColumn,
    sheetHeaders,
  });
  if (table.type === "view" || table.type === "materialized_view") {
    if (writesToPostgres(input.direction)) extraErrors.push("Views are read-only. Use the PostgreSQL → Google Sheets direction.");
  }
  const errors = [...extraErrors, ...result.errors];
  return { valid: errors.length === 0, errors, warnings: result.warnings };
}

async function replaceMappings(configId: string, mappings: SyncConfigInput["mappings"]) {
  await getDb().transaction(async (tx) => {
    await tx.delete(syncMappings).where(eq(syncMappings.syncConfigurationId, configId));
    await tx.insert(syncMappings).values(
      mappings.map((mapping, position) => ({ syncConfigurationId: configId, pgColumn: mapping.pgColumn, sheetColumn: mapping.sheetColumn.trim(), position })),
    );
  });
}

interface PreparedRun {
  context: SyncContext;
  plan: SyncPlan;
  sheet: Awaited<ReturnType<typeof readSheet>>;
  baseline: Map<string, string>;
  issues: string[];
  excludedKeys: Set<string>;
}

async function prepare(userId: string, config: SyncConfiguration): Promise<PreparedRun> {
  // Worksheets are tracked by id; pick up renames before reading.
  const worksheet = await sheetsService.getWorksheet(userId, config.spreadsheetId, config.worksheetId);
  if (worksheet.title !== config.worksheetTitle) {
    await getDb().update(syncConfigurations).set({ worksheetTitle: worksheet.title }).where(eq(syncConfigurations.id, config.id));
    config = { ...config, worksheetTitle: worksheet.title };
  }
  const context = await loadContext(userId, config);
  const needsSheetTime = config.conflictStrategy === "LAST_WRITE_WINS";
  const [pg, sheet, baseline, sheetModifiedAt] = await Promise.all([
    readPostgres(context),
    readSheet(context),
    loadBaseline(config.id),
    needsSheetTime ? sheetsService.getModifiedTime(userId, config.spreadsheetId) : Promise.resolve(null),
  ]);
  if (!sheet.headers.some(Boolean) && sheet.dataRowCount > 0) {
    throw new AppError(400, "SCHEMA_MISMATCH", "The worksheet has data but no header row. Add column names in row 1.");
  }
  if (!writesToSheets(config.direction) && !sheet.headers.some(Boolean)) {
    throw new AppError(400, "SCHEMA_MISMATCH", "The worksheet is empty. Add a header row in Google Sheets, or sync from PostgreSQL first.");
  }
  if (!writesToSheets(config.direction)) {
    const missing = context.mappings.filter((mapping) => !sheet.headerIndex.has(mapping.sheetColumn.trim().toLowerCase()));
    if (missing.length) {
      throw new AppError(400, "SCHEMA_MISMATCH", `These mapped columns are missing from the worksheet header: ${missing.map((m) => m.sheetColumn).join(", ")}.`);
    }
  }
  const excludedKeys = new Set(sheet.duplicateKeys);
  const plan = planSync({
    direction: config.direction,
    strategy: config.conflictStrategy,
    columns: context.columnNames,
    postgres: pg.rows,
    sheets: sheet.rows,
    baseline,
    excludedKeys,
    postgresTimestamps: pg.timestamps,
    sheetModifiedAt,
  });
  return { context, plan, sheet, baseline, issues: [...pg.issues, ...sheet.issues], excludedKeys };
}

function restoreBaseline(next: Map<string, string>, previous: Map<string, string>, key: string) {
  const old = previous.get(key);
  if (old) next.set(key, old);
  else next.delete(key);
}

async function execute(run: SyncRun, config: SyncConfiguration, options: { confirmDeletes: boolean }): Promise<void> {
  const userId = config.userId;
  const errors: string[] = [];
  const notes: string[] = [];
  const details: SyncRunDetails = {
    postgres: { inserted: 0, updated: 0, deleted: 0 },
    sheets: { inserted: 0, updated: 0, deleted: 0 },
  };
  let conflictsCount = 0;
  let rowsProcessed = 0;
  try {
    const prepared = await prepare(userId, config);
    const { context, plan, sheet, baseline } = prepared;
    errors.push(...prepared.issues);
    rowsProcessed = new Set([...plan.nextBaseline.keys(), ...sheet.rows.keys()]).size + sheet.blankKeyRows.length;
    const nextBaseline = plan.nextBaseline;

    // Deletions are destructive: skip them unless the user confirmed (or the sync never deletes).
    const deleteCount = plan.sheets.deletes.length + plan.postgres.deletes.length;
    if (deleteCount > 0 && (config.deleteMode === "NEVER" || !options.confirmDeletes)) {
      for (const del of plan.sheets.deletes) restoreBaseline(nextBaseline, baseline, del.key);
      for (const del of plan.postgres.deletes) restoreBaseline(nextBaseline, baseline, del.key);
      plan.sheets.deletes = [];
      plan.postgres.deletes = [];
      details.skippedDeletes = deleteCount;
      notes.push(
        config.deleteMode === "NEVER"
          ? `${deleteCount} deletion(s) were not propagated because this sync never deletes rows.`
          : `${deleteCount} deletion(s) were skipped. Run the sync manually and confirm to apply them.`,
      );
    }

    conflictsCount = plan.conflicts.length;
    await recordConflicts(userId, config.id, run.id, config.conflictStrategy, plan.conflicts);

    const attempted =
      plan.postgres.inserts.length + plan.postgres.updates.length + plan.postgres.deletes.length +
      plan.sheets.inserts.length + plan.sheets.updates.length + plan.sheets.deletes.length +
      (writesToPostgres(config.direction) ? sheet.blankKeyRows.length : 0);

    const pgResult = await applyPostgresChanges(context, plan.postgres);
    details.postgres = { inserted: pgResult.inserted, updated: pgResult.updated, deleted: pgResult.deleted };
    for (const [key, message] of pgResult.failed) {
      restoreBaseline(nextBaseline, baseline, key);
      errors.push(message);
    }

    let keyWritebacks: Array<{ rowNumber: number; key: string; row: Record<string, string> }> = [];
    if (writesToPostgres(config.direction) && sheet.blankKeyRows.length) {
      const blank = await insertBlankKeyRows(context, sheet.blankKeyRows);
      errors.push(...blank.errors);
      details.postgres.inserted += blank.created.length;
      keyWritebacks = blank.created;
      for (const created of blank.created) {
        nextBaseline.set(created.key, rowHash(created.row, context.columnNames));
      }
    }

    const sheetResult = await applySheetChanges(context, sheet, plan.sheets, keyWritebacks);
    details.sheets = { inserted: sheetResult.inserted, updated: sheetResult.updated, deleted: sheetResult.deleted };
    if (sheetResult.failed.size) {
      for (const key of sheetResult.failed.keys()) restoreBaseline(nextBaseline, baseline, key);
      errors.push(`Google Sheets update failed: ${[...new Set(sheetResult.failed.values())].join("; ")}`);
    }

    await saveBaseline(config.id, nextBaseline);

    const unresolved = plan.conflicts.filter((conflict) => !conflict.resolution).length;
    if (unresolved) notes.push(`${unresolved} conflict(s) need manual review.`);
    if (plan.unmanaged) notes.push(`${plan.unmanaged} row(s) exist only in the destination and were left untouched.`);

    const inserted = details.postgres.inserted + details.sheets.inserted;
    const updated = details.postgres.updated + details.sheets.updated;
    const deleted = details.postgres.deleted + details.sheets.deleted;
    const wrote = inserted + updated + deleted > 0;
    // SUCCESS: everything applied. FAILED: every attempted change failed. PARTIAL: anything in between.
    const status = errors.length === 0 && unresolved === 0 ? "SUCCESS" : attempted > 0 && !wrote && errors.length > 0 ? "FAILED" : "PARTIAL";
    details.notes = notes;
    await syncRunService.finish(run, {
      status,
      rowsProcessed,
      rowsInserted: inserted,
      rowsUpdated: updated,
      rowsDeleted: deleted,
      conflictsCount,
      errors,
      errorMessage: status === "FAILED" ? errors[0] ?? null : null,
      details,
    });
    await logActivity(userId, {
      action: "SYNC_COMPLETED",
      status: status === "SUCCESS" ? "SUCCESS" : "INFO",
      entityType: "sync",
      entityId: config.id,
      entityName: config.name,
      message: `Sync "${config.name}" ${status === "SUCCESS" ? "completed" : "completed with warnings"}: ${inserted} inserted, ${updated} updated, ${deleted} deleted${conflictsCount ? `, ${conflictsCount} conflict(s)` : ""}`,
      metadata: { runId: run.id, errors: errors.length },
    });
  } catch (error) {
    const friendly = error instanceof AppError ? error.message : "The sync failed unexpectedly. Check the server logs for details.";
    if (!(error instanceof AppError)) logger.error({ err: error, runId: run.id }, "Sync run crashed");
    await syncRunService
      .finish(run, {
        status: "FAILED",
        rowsProcessed,
        rowsInserted: details.postgres.inserted + details.sheets.inserted,
        rowsUpdated: details.postgres.updated + details.sheets.updated,
        rowsDeleted: details.postgres.deleted + details.sheets.deleted,
        conflictsCount,
        errors: [...errors, friendly],
        errorMessage: friendly,
        details,
      })
      .catch((finishError: unknown) => logger.error({ err: finishError }, "Failed to record failed sync run"));
    await logActivity(userId, {
      action: "SYNC_FAILED",
      status: "FAILURE",
      entityType: "sync",
      entityId: config.id,
      entityName: config.name,
      message: `Sync "${config.name}" failed: ${friendly}`,
      metadata: { runId: run.id },
    });
  }
}

export const syncService = {
  async list(userId: string) {
    const configs = await getDb()
      .select()
      .from(syncConfigurations)
      .where(eq(syncConfigurations.userId, userId))
      .orderBy(desc(syncConfigurations.createdAt));
    if (!configs.length) return [];
    const ids = configs.map((config) => config.id);
    const [mappings, running] = await Promise.all([
      getDb().select().from(syncMappings).where(inArray(syncMappings.syncConfigurationId, ids)),
      getDb()
        .select({ id: syncRuns.id, configId: syncRuns.syncConfigurationId })
        .from(syncRuns)
        .where(and(inArray(syncRuns.syncConfigurationId, ids), eq(syncRuns.status, "RUNNING"))),
    ]);
    return configs.map((config) => ({
      ...config,
      mappingCount: mappings.filter((mapping) => mapping.syncConfigurationId === config.id).length,
      runningRunId: running.find((run) => run.configId === config.id)?.id ?? null,
    }));
  },

  async get(userId: string, id: string) {
    const config = await getOwnedConfig(userId, id);
    const [mappings, running] = await Promise.all([loadMappings(id), syncRunService.findRunning(id)]);
    return { ...config, mappings, runningRunId: running?.id ?? null };
  },

  validate(userId: string, input: ValidateSyncInput) {
    return validateAgainstSources(userId, input);
  },

  async create(userId: string, input: SyncConfigInput) {
    const validation = await validateAgainstSources(userId, input);
    if (!validation.valid) throw new AppError(400, "INVALID_MAPPING", validation.errors[0]!, { details: validation });
    const { mappings, ...fields } = input;
    const [created] = await getDb()
      .insert(syncConfigurations)
      .values({ ...fields, userId, databaseName: fields.databaseName ?? null, timestampColumn: fields.timestampColumn ?? null, scheduleMinutes: fields.scheduleMinutes ?? null })
      .returning();
    await replaceMappings(created!.id, mappings);
    await logActivity(userId, {
      action: "SYNC_CREATED",
      entityType: "sync",
      entityId: created!.id,
      entityName: created!.name,
      message: `Created sync "${created!.name}": ${fields.schemaName}.${fields.tableName} ↔ ${fields.spreadsheetName} / ${fields.worksheetTitle}`,
    });
    return this.get(userId, created!.id);
  },

  async update(userId: string, id: string, input: UpdateSyncConfigInput) {
    const existing = await this.get(userId, id);
    const merged = {
      ...existing,
      ...input,
      mappings: input.mappings ?? existing.mappings.map(({ pgColumn, sheetColumn }) => ({ pgColumn, sheetColumn })),
    };
    const structural = ["connectionId", "databaseName", "schemaName", "tableName", "keyColumn", "spreadsheetId", "worksheetId", "direction", "conflictStrategy", "mappings", "timestampColumn"] as const;
    if (structural.some((field) => input[field] !== undefined)) {
      const validation = await validateAgainstSources(userId, merged);
      if (!validation.valid) throw new AppError(400, "INVALID_MAPPING", validation.errors[0]!, { details: validation });
    }
    const { mappings, ...fields } = input;
    const sourceChanged = ["connectionId", "databaseName", "schemaName", "tableName", "keyColumn", "spreadsheetId", "worksheetId"].some(
      (field) => input[field as keyof UpdateSyncConfigInput] !== undefined && input[field as keyof UpdateSyncConfigInput] !== existing[field as keyof typeof existing],
    );
    if (Object.keys(fields).length) {
      await getDb().update(syncConfigurations).set(fields).where(eq(syncConfigurations.id, id));
    }
    if (mappings) {
      await replaceMappings(id, mappings);
      await logActivity(userId, { action: "MAPPING_UPDATED", entityType: "sync", entityId: id, entityName: existing.name, message: `Updated column mapping for "${existing.name}" (${mappings.length} columns)` });
    }
    if (sourceChanged || mappings) {
      // The baseline describes the old pairing; start fresh so nothing is mistaken for a deletion.
      await saveBaseline(id, new Map());
    }
    await logActivity(userId, { action: "SYNC_UPDATED", entityType: "sync", entityId: id, entityName: input.name ?? existing.name, message: `Updated sync "${input.name ?? existing.name}"` });
    return this.get(userId, id);
  },

  async remove(userId: string, id: string) {
    const config = await getOwnedConfig(userId, id);
    if (activeRuns.has(id)) throw new AppError(409, "SYNC_IN_PROGRESS", "This sync is running. Wait for it to finish before deleting it.");
    await getDb().delete(syncConfigurations).where(eq(syncConfigurations.id, id));
    await logActivity(userId, { action: "SYNC_DELETED", entityType: "sync", entityId: id, entityName: config.name, message: `Deleted sync "${config.name}"` });
  },

  /** Dry run: reads both sides and reports what a sync would change, without writing anything. */
  async preview(userId: string, id: string) {
    const config = await getOwnedConfig(userId, id);
    const prepared = await prepare(userId, config);
    const summary = planSummary(prepared.plan);
    return {
      ...summary,
      newSheetRows: writesToPostgres(config.direction) ? prepared.sheet.blankKeyRows.length : 0,
      deletesRequireConfirmation: config.deleteMode === "CONFIRM" && summary.postgres.deletes + summary.sheets.deletes > 0,
      deleteMode: config.deleteMode,
      issues: prepared.issues,
      conflicts: prepared.plan.conflicts.slice(0, 20).map((conflict) => ({ key: conflict.key, type: conflict.type, resolution: conflict.resolution, message: conflict.message })),
    };
  },

  /** Starts a run in the background and returns it immediately (status RUNNING). */
  async startRun(userId: string, id: string, options: { confirmDeletes: boolean; trigger?: "MANUAL" | "SCHEDULED" }) {
    const config = await getOwnedConfig(userId, id);
    if (activeRuns.has(id) || (await syncRunService.findRunning(id))) {
      throw new AppError(409, "SYNC_IN_PROGRESS", "This sync is already running.");
    }
    activeRuns.add(id);
    try {
      const run = await syncRunService.start(config, options.trigger ?? "MANUAL");
      await logActivity(userId, {
        action: "SYNC_STARTED",
        status: "INFO",
        entityType: "sync",
        entityId: id,
        entityName: config.name,
        message: `Started ${options.trigger === "SCHEDULED" ? "scheduled " : ""}sync "${config.name}"`,
        metadata: { runId: run.id },
      });
      setImmediate(() => {
        execute(run, config, options)
          .catch((error: unknown) => logger.error({ err: error }, "Sync execution failed"))
          .finally(() => activeRuns.delete(id));
      });
      return run;
    } catch (error) {
      activeRuns.delete(id);
      throw error;
    }
  },

  isRunning(id: string) {
    return activeRuns.has(id);
  },
};
