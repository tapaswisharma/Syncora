import type { ConflictStrategy, SyncDirection } from "../../db/schema.js";
import type { ColumnInfo, TableMeta } from "../postgres/introspection.service.js";
import type { ColumnMapping } from "./types.js";

export interface MappingValidationInput {
  mappings: ColumnMapping[];
  table: Pick<TableMeta, "columns">;
  keyColumn: string;
  direction: SyncDirection;
  strategy: ConflictStrategy;
  timestampColumn?: string | null;
  /** Current worksheet header row; empty when the worksheet is blank. `null` when unknown. */
  sheetHeaders: string[] | null;
}

export interface MappingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const normalize = (value: string) => value.trim().toLowerCase();

export const writesToSheets = (direction: SyncDirection) => direction !== "SHEETS_TO_POSTGRES";
export const writesToPostgres = (direction: SyncDirection) => direction !== "POSTGRES_TO_SHEETS";

/** Strategies that make sense for a direction. One-way syncs can only let the source win (or ask). */
export function allowedStrategies(direction: SyncDirection): ConflictStrategy[] {
  if (direction === "POSTGRES_TO_SHEETS") return ["POSTGRES_WINS", "MANUAL"];
  if (direction === "SHEETS_TO_POSTGRES") return ["GOOGLE_SHEETS_WINS", "MANUAL"];
  return ["LAST_WRITE_WINS", "POSTGRES_WINS", "GOOGLE_SHEETS_WINS", "MANUAL"];
}

/** Suggests mappings by matching column names loosely (created_at ~ "Created At"). */
export function suggestMappings(pgColumns: string[], sheetHeaders: string[]): ColumnMapping[] {
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const available = new Map<string, string>();
  for (const header of sheetHeaders) {
    if (header && !available.has(squash(header))) available.set(squash(header), header);
  }
  const result: ColumnMapping[] = [];
  for (const column of pgColumns) {
    const match = available.get(squash(column));
    if (match) {
      result.push({ pgColumn: column, sheetColumn: match });
      available.delete(squash(column));
    }
  }
  return result;
}

/** Converts snake_case to a friendly sheet header (created_at -> Created At). */
export function defaultHeader(column: string): string {
  return column
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function validateMapping(input: MappingValidationInput): MappingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const columns = new Map<string, ColumnInfo>(input.table.columns.map((column) => [column.name, column]));
  const { mappings, direction } = input;

  if (mappings.length === 0) errors.push("Map at least one column.");

  const seenPg = new Set<string>();
  const seenSheet = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping.sheetColumn.trim()) errors.push(`Column "${mapping.pgColumn}" needs a Google Sheets column name.`);
    if (seenPg.has(mapping.pgColumn)) errors.push(`PostgreSQL column "${mapping.pgColumn}" is mapped more than once.`);
    if (seenSheet.has(normalize(mapping.sheetColumn))) errors.push(`Sheet column "${mapping.sheetColumn}" is mapped more than once.`);
    seenPg.add(mapping.pgColumn);
    seenSheet.add(normalize(mapping.sheetColumn));

    const column = columns.get(mapping.pgColumn);
    if (!column) {
      errors.push(`PostgreSQL column "${mapping.pgColumn}" does not exist in the table.`);
      continue;
    }
    if (writesToPostgres(direction) && column.isGenerated && mapping.pgColumn !== input.keyColumn) {
      errors.push(`"${mapping.pgColumn}" is a generated column and cannot be written from Google Sheets. Unmap it or sync PostgreSQL → Sheets only.`);
    }
  }

  const key = columns.get(input.keyColumn);
  if (!key) {
    errors.push(`Row identifier column "${input.keyColumn}" does not exist in the table.`);
  } else {
    if (!seenPg.has(input.keyColumn)) errors.push(`The row identifier column "${input.keyColumn}" must be mapped.`);
    if (key.kind === "json" || key.kind === "array") errors.push("JSON and array columns cannot be used as the row identifier.");
    if (!key.isUnique) {
      warnings.push(`"${input.keyColumn}" is not a primary key or unique column. Duplicate values will be skipped during sync.`);
    }
  }

  if (!allowedStrategies(direction).includes(input.strategy)) {
    errors.push(`The ${input.strategy} conflict strategy cannot be used with a one-way ${direction} sync.`);
  }

  if (input.strategy === "LAST_WRITE_WINS") {
    const timestamp = input.timestampColumn ? columns.get(input.timestampColumn) : undefined;
    if (!input.timestampColumn) {
      warnings.push("Last write wins needs an \"updated at\" timestamp column; without one, conflicts are left for manual review.");
    } else if (!timestamp) {
      errors.push(`Timestamp column "${input.timestampColumn}" does not exist in the table.`);
    } else if (!["timestamp", "timestamptz", "date"].includes(timestamp.kind)) {
      errors.push(`"${input.timestampColumn}" is not a date/timestamp column.`);
    }
  }

  if (input.sheetHeaders && input.sheetHeaders.some(Boolean)) {
    const headerCounts = new Map<string, number>();
    for (const header of input.sheetHeaders) {
      if (header) headerCounts.set(normalize(header), (headerCounts.get(normalize(header)) ?? 0) + 1);
    }
    for (const mapping of mappings) {
      const count = headerCounts.get(normalize(mapping.sheetColumn)) ?? 0;
      if (count === 0) {
        if (writesToSheets(direction)) warnings.push(`Sheet column "${mapping.sheetColumn}" will be added to the header row.`);
        else errors.push(`Sheet column "${mapping.sheetColumn}" was not found in the worksheet's header row.`);
      } else if (count > 1) {
        errors.push(`The worksheet has more than one "${mapping.sheetColumn}" column. Rename one so rows can be matched.`);
      }
    }
  } else if (input.sheetHeaders && !writesToSheets(direction)) {
    errors.push("The worksheet is empty. Add a header row in Google Sheets first, or sync from PostgreSQL.");
  }

  if (writesToPostgres(direction)) {
    for (const column of input.table.columns) {
      if (!column.nullable && !column.hasDefault && !column.isGenerated && !seenPg.has(column.name)) {
        warnings.push(`"${column.name}" is required in PostgreSQL but not mapped, so rows added in Sheets will fail to insert.`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
