import { asc, eq } from "drizzle-orm";
import type pg from "pg";
import { env } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import { syncMappings, syncRowStates, type SyncConfiguration, type SyncMapping } from "../../db/schema.js";
import { AppError } from "../../utils/errors.js";
import { sheetsService, type SheetCell } from "../google/sheets.service.js";
import { connectionService } from "../postgres/connection.service.js";
import { introspectionService, type ColumnInfo, type TableMeta } from "../postgres/introspection.service.js";
import { qualifiedName, quoteIdent } from "../postgres/identifiers.js";
import { translatePgError } from "../postgres/pg-errors.js";
import type { CanonicalRow, SheetRowRef } from "./types.js";
import { canonicalize } from "./value-codec.js";

export interface SyncContext {
  userId: string;
  config: SyncConfiguration;
  mappings: SyncMapping[];
  pool: pg.Pool;
  table: TableMeta;
  /** Mapped PostgreSQL columns, in mapping order. */
  columns: ColumnInfo[];
  columnNames: string[];
  key: ColumnInfo;
}

export interface PostgresSnapshot {
  rows: Map<string, CanonicalRow>;
  timestamps: Map<string, Date | null>;
  issues: string[];
}

export interface SheetSnapshot {
  headers: string[];
  /** Normalized sheet header -> column index. */
  headerIndex: Map<string, number>;
  /** Raw cell values for every data row, by 1-based row number. */
  rawRows: Map<number, SheetCell[]>;
  rows: Map<string, SheetRowRef>;
  /** Rows with values but an empty identifier (typically added by hand in Sheets). */
  blankKeyRows: SheetRowRef[];
  /** Keys that appear more than once; they are skipped. */
  duplicateKeys: Set<string>;
  issues: string[];
  dataRowCount: number;
}

export const normalizeHeader = (value: string) => value.trim().toLowerCase();

export async function loadMappings(configId: string): Promise<SyncMapping[]> {
  return getDb().select().from(syncMappings).where(eq(syncMappings.syncConfigurationId, configId)).orderBy(asc(syncMappings.position));
}

export async function loadContext(userId: string, config: SyncConfiguration): Promise<SyncContext> {
  const mappings = await loadMappings(config.id);
  if (!mappings.length) throw new AppError(400, "INVALID_MAPPING", "This sync has no column mappings. Edit the sync and map at least one column.");
  const pool = await connectionService.poolFor(userId, config.connectionId, config.databaseName ?? undefined);
  const table = await introspectionService.getTable(pool, config.schemaName, config.tableName);
  const byName = new Map(table.columns.map((column) => [column.name, column]));
  const missing = mappings.filter((mapping) => !byName.has(mapping.pgColumn)).map((mapping) => mapping.pgColumn);
  if (missing.length) {
    throw new AppError(400, "SCHEMA_MISMATCH", `These mapped columns no longer exist in ${config.schemaName}.${config.tableName}: ${missing.join(", ")}. Update the column mapping.`);
  }
  const key = byName.get(config.keyColumn);
  if (!key) throw new AppError(400, "SCHEMA_MISMATCH", `The row identifier column "${config.keyColumn}" no longer exists.`);
  const columns = mappings.map((mapping) => byName.get(mapping.pgColumn)!);
  return { userId, config, mappings, pool, table, columns, columnNames: columns.map((column) => column.name), key };
}

export async function readPostgres(context: SyncContext): Promise<PostgresSnapshot> {
  const { config, columns, key } = context;
  const selected = columns.map((column) => quoteIdent(column.name));
  const timestampColumn = config.timestampColumn && context.table.columns.find((column) => column.name === config.timestampColumn);
  if (timestampColumn) selected.push(`${quoteIdent(timestampColumn.name)} as "__dbsynchro_ts"`);

  let result: pg.QueryResult<Record<string, unknown>>;
  try {
    result = await context.pool.query(
      `select ${selected.join(", ")} from ${qualifiedName(config.schemaName, config.tableName)} order by ${quoteIdent(key.name)} limit ${env.MAX_SYNC_ROWS + 1}`,
    );
  } catch (error) {
    throw translatePgError(error);
  }
  if (result.rows.length > env.MAX_SYNC_ROWS) {
    throw new AppError(400, "BAD_REQUEST", `The table has more than ${env.MAX_SYNC_ROWS} rows, which exceeds the sync limit (MAX_SYNC_ROWS).`);
  }

  const rows = new Map<string, CanonicalRow>();
  const timestamps = new Map<string, Date | null>();
  const issues: string[] = [];
  for (const record of result.rows) {
    const row: CanonicalRow = {};
    for (const column of columns) row[column.name] = canonicalize(record[column.name], column.kind);
    const rowKey = row[key.name] ?? "";
    if (!rowKey) {
      issues.push(`A PostgreSQL row has an empty "${key.name}" value and was skipped.`);
      continue;
    }
    if (rows.has(rowKey)) {
      issues.push(`PostgreSQL has more than one row with ${key.name} = ${rowKey}; only the first was used.`);
      continue;
    }
    rows.set(rowKey, row);
    if (timestampColumn) {
      const raw = record.__dbsynchro_ts;
      const parsed = raw ? new Date(String(raw).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")) : null;
      timestamps.set(rowKey, parsed && !Number.isNaN(parsed.getTime()) ? parsed : null);
    }
  }
  return { rows, timestamps, issues };
}

export async function readSheet(context: SyncContext): Promise<SheetSnapshot> {
  const { config, mappings, columns, key } = context;
  const data = await sheetsService.readWorksheet(context.userId, config.spreadsheetId, config.worksheetTitle);
  const headerIndex = new Map<string, number>();
  data.headers.forEach((header, index) => {
    if (header && !headerIndex.has(normalizeHeader(header))) headerIndex.set(normalizeHeader(header), index);
  });

  const snapshot: SheetSnapshot = {
    headers: data.headers,
    headerIndex,
    rawRows: new Map(),
    rows: new Map(),
    blankKeyRows: [],
    duplicateKeys: new Set(),
    issues: [],
    dataRowCount: 0,
  };

  const indexes = mappings.map((mapping) => headerIndex.get(normalizeHeader(mapping.sheetColumn)));
  const keyPosition = mappings.findIndex((mapping) => mapping.pgColumn === key.name);
  const firstSeen = new Map<string, number>();

  for (const { rowNumber, values } of data.rows) {
    snapshot.rawRows.set(rowNumber, values);
    if (values.every((cell) => cell === "" || cell === null || cell === undefined)) continue;
    snapshot.dataRowCount++;
    const row: CanonicalRow = {};
    columns.forEach((column, position) => {
      const index = indexes[position];
      row[column.name] = index === undefined ? "" : canonicalize(values[index], column.kind);
    });
    const rowKey = keyPosition >= 0 ? row[key.name] ?? "" : "";
    if (!rowKey) {
      snapshot.blankKeyRows.push({ rowNumber, row });
      continue;
    }
    if (firstSeen.has(rowKey)) {
      snapshot.duplicateKeys.add(rowKey);
      snapshot.issues.push(`Sheet rows ${firstSeen.get(rowKey)} and ${rowNumber} share ${key.name} = ${rowKey}; this key was skipped. Remove the duplicate in Google Sheets.`);
      continue;
    }
    firstSeen.set(rowKey, rowNumber);
    snapshot.rows.set(rowKey, { rowNumber, row });
  }
  for (const duplicate of snapshot.duplicateKeys) snapshot.rows.delete(duplicate);
  return snapshot;
}

export async function loadBaseline(configId: string): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ rowKey: syncRowStates.rowKey, rowHash: syncRowStates.rowHash })
    .from(syncRowStates)
    .where(eq(syncRowStates.syncConfigurationId, configId));
  return new Map(rows.map((row) => [row.rowKey, row.rowHash]));
}

export async function saveBaseline(configId: string, baseline: Map<string, string>): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(syncRowStates).where(eq(syncRowStates.syncConfigurationId, configId));
    const entries = [...baseline.entries()];
    const now = new Date();
    for (let start = 0; start < entries.length; start += 1000) {
      const chunk = entries.slice(start, start + 1000).map(([rowKey, rowHash]) => ({
        syncConfigurationId: configId,
        rowKey,
        rowHash,
        syncedAt: now,
      }));
      await tx.insert(syncRowStates).values(chunk);
    }
  });
}
