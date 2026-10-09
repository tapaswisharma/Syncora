import type { ConflictStrategy, ConflictType, SyncDirection } from "../../db/schema.js";

/** A row reduced to its mapped columns, each value in canonical string form ("" means empty/NULL). */
export type CanonicalRow = Record<string, string>;
export type Side = "POSTGRES" | "SHEETS";

export interface ColumnMapping {
  pgColumn: string;
  sheetColumn: string;
}

export interface SheetRowRef {
  rowNumber: number;
  row: CanonicalRow;
}

export interface PlannedConflict {
  key: string;
  type: ConflictType;
  postgres: CanonicalRow | null;
  sheets: CanonicalRow | null;
  resolution: Side | null;
  message: string;
}

export interface SyncPlan {
  sheets: {
    inserts: Array<{ key: string; row: CanonicalRow }>;
    updates: Array<{ key: string; rowNumber: number; row: CanonicalRow }>;
    deletes: Array<{ key: string; rowNumber: number }>;
  };
  postgres: {
    inserts: Array<{ key: string; row: CanonicalRow }>;
    updates: Array<{ key: string; row: CanonicalRow }>;
    deletes: Array<{ key: string }>;
  };
  conflicts: PlannedConflict[];
  /** Baseline after the plan is fully applied. */
  nextBaseline: Map<string, string>;
  unchanged: number;
  /** Rows only on the target side of a one-way sync that were never synced (left untouched). */
  unmanaged: number;
}

export interface PlanInput {
  direction: SyncDirection;
  strategy: ConflictStrategy;
  columns: string[];
  postgres: Map<string, CanonicalRow>;
  sheets: Map<string, SheetRowRef>;
  baseline: Map<string, string>;
  /** Keys that must not be touched this run (e.g. duplicated in the sheet). Baseline is preserved. */
  excludedKeys?: Set<string>;
  postgresTimestamps?: Map<string, Date | null>;
  sheetModifiedAt?: Date | null;
}
