import type { SideCounts } from "../../db/schema.js";
import { qualifiedName, quoteIdent } from "../postgres/identifiers.js";
import { rowErrorMessage } from "../postgres/pg-errors.js";
import type { SyncContext } from "./sync-context.js";
import type { CanonicalRow, SheetRowRef, SyncPlan } from "./types.js";
import { canonicalize, toPgParam } from "./value-codec.js";

export interface PostgresWriteResult extends SideCounts {
  failed: Map<string, string>;
}

function writableColumns(context: SyncContext, includeKey: boolean) {
  return context.columns.filter((column) => !column.isGenerated && (includeKey || column.name !== context.key.name));
}

async function insertRow(context: SyncContext, row: CanonicalRow, includeKey: boolean): Promise<Record<string, unknown>> {
  const columns = writableColumns(context, includeKey).filter((column) => !(row[column.name] === "" && column.hasDefault));
  const table = qualifiedName(context.config.schemaName, context.config.tableName);
  const params = columns.map((column) => toPgParam(row[column.name] ?? "", column.kind));
  const sql = columns.length
    ? `insert into ${table} (${columns.map((c) => quoteIdent(c.name)).join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning ${quoteIdent(context.key.name)}`
    : `insert into ${table} default values returning ${quoteIdent(context.key.name)}`;
  const result = await context.pool.query(sql, params);
  return result.rows[0] ?? {};
}

/** Applies planned row changes to PostgreSQL. Each row is its own statement so one bad row cannot block the rest. */
export async function applyPostgresChanges(context: SyncContext, changes: SyncPlan["postgres"]): Promise<PostgresWriteResult> {
  const result: PostgresWriteResult = { inserted: 0, updated: 0, deleted: 0, failed: new Map() };
  const table = qualifiedName(context.config.schemaName, context.config.tableName);
  const keyIdent = quoteIdent(context.key.name);

  for (const { key, row } of changes.inserts) {
    try {
      await insertRow(context, row, true);
      result.inserted++;
    } catch (error) {
      result.failed.set(key, `Insert ${context.key.name}=${key}: ${rowErrorMessage(error)}`);
    }
  }

  const updatable = writableColumns(context, false);
  for (const { key, row } of changes.updates) {
    if (!updatable.length) continue;
    try {
      const params = updatable.map((column) => toPgParam(row[column.name] ?? "", column.kind));
      params.push(key);
      const assignments = updatable.map((column, i) => `${quoteIdent(column.name)} = $${i + 1}`).join(", ");
      const updated = await context.pool.query(`update ${table} set ${assignments} where ${keyIdent} = $${params.length}`, params);
      if (updated.rowCount) result.updated++;
      else result.failed.set(key, `Update ${context.key.name}=${key}: the row no longer exists in PostgreSQL.`);
    } catch (error) {
      result.failed.set(key, `Update ${context.key.name}=${key}: ${rowErrorMessage(error)}`);
    }
  }

  for (const { key } of changes.deletes) {
    try {
      const deleted = await context.pool.query(`delete from ${table} where ${keyIdent} = $1`, [key]);
      result.deleted += deleted.rowCount ?? 0;
    } catch (error) {
      result.failed.set(key, `Delete ${context.key.name}=${key}: ${rowErrorMessage(error)}`);
    }
  }
  return result;
}

/**
 * Rows typed into the sheet without an identifier: insert them and let PostgreSQL generate the key
 * (serial/identity/default). The generated key is returned so it can be written back to the sheet.
 */
export async function insertBlankKeyRows(
  context: SyncContext,
  rows: SheetRowRef[],
): Promise<{ created: Array<{ rowNumber: number; key: string; row: CanonicalRow }>; errors: string[] }> {
  const created: Array<{ rowNumber: number; key: string; row: CanonicalRow }> = [];
  const errors: string[] = [];
  if (!rows.length) return { created, errors };
  if (!context.key.hasDefault) {
    errors.push(
      `${rows.length} sheet row(s) have no "${context.key.name}" value and were skipped. Fill in the identifier, or use a column with a default (serial/identity/uuid).`,
    );
    return { created, errors };
  }
  for (const { rowNumber, row } of rows) {
    try {
      const inserted = await insertRow(context, row, false);
      const key = canonicalize(inserted[context.key.name], context.key.kind);
      created.push({ rowNumber, key, row: { ...row, [context.key.name]: key } });
    } catch (error) {
      errors.push(`Sheet row ${rowNumber}: ${rowErrorMessage(error)}`);
    }
  }
  return { created, errors };
}
