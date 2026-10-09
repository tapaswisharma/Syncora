import type { ConflictType } from "../../db/schema.js";
import { chooseResolution } from "./conflict.service.js";
import type { CanonicalRow, PlanInput, PlannedConflict, Side, SyncPlan } from "./types.js";
import { rowHash } from "./value-codec.js";

function describeConflict(type: ConflictType, key: string): string {
  switch (type) {
    case "UPDATE_UPDATE":
      return `Row ${key} was changed in both PostgreSQL and Google Sheets since the last sync.`;
    case "UPDATE_DELETE":
      return `Row ${key} was changed in PostgreSQL but deleted from Google Sheets.`;
    case "DELETE_UPDATE":
      return `Row ${key} was deleted from PostgreSQL but changed in Google Sheets.`;
    case "INSERT_INSERT":
      return `Row ${key} exists on both sides with different values and has never been synced.`;
  }
}

/**
 * Decides, for every row key, what must change on each side. Pure: no I/O.
 *
 * Each side's current row is compared with the baseline (the hash recorded at the last
 * successful sync) to tell which side changed. Changes on one side flow to the other;
 * changes on both sides are conflicts resolved by the configured strategy.
 */
export function planSync(input: PlanInput): SyncPlan {
  const plan: SyncPlan = {
    sheets: { inserts: [], updates: [], deletes: [] },
    postgres: { inserts: [], updates: [], deletes: [] },
    conflicts: [],
    nextBaseline: new Map(),
    unchanged: 0,
    unmanaged: 0,
  };
  const source: Side | null =
    input.direction === "POSTGRES_TO_SHEETS" ? "POSTGRES" : input.direction === "SHEETS_TO_POSTGRES" ? "SHEETS" : null;

  const keys = new Set<string>([...input.postgres.keys(), ...input.sheets.keys(), ...input.baseline.keys()]);

  for (const key of keys) {
    const baseline = input.baseline.get(key);
    if (input.excludedKeys?.has(key)) {
      if (baseline) plan.nextBaseline.set(key, baseline);
      continue;
    }
    const pgRow = input.postgres.get(key);
    const sheetRef = input.sheets.get(key);
    const pgHash = pgRow ? rowHash(pgRow, input.columns) : undefined;
    const sheetHash = sheetRef ? rowHash(sheetRef.row, input.columns) : undefined;

    if (pgHash === sheetHash) {
      if (pgHash) {
        plan.nextBaseline.set(key, pgHash);
        plan.unchanged++;
      }
      continue;
    }

    let winner: Side | null = null;
    let conflictType: ConflictType | null = null;
    if (baseline === undefined) {
      if (!pgRow) winner = "SHEETS";
      else if (!sheetRef) winner = "POSTGRES";
      else conflictType = "INSERT_INSERT";
    } else {
      const pgChanged = pgHash !== baseline;
      const sheetChanged = sheetHash !== baseline;
      if (pgChanged && !sheetChanged) winner = "POSTGRES";
      else if (sheetChanged && !pgChanged) winner = "SHEETS";
      else conflictType = !pgRow ? "DELETE_UPDATE" : !sheetRef ? "UPDATE_DELETE" : "UPDATE_UPDATE";
    }

    // One-way syncs mirror the source. A change that only exists on the target side is
    // reverted, except rows that were never synced: those are left alone.
    if (source && winner && winner !== source) {
      if (baseline === undefined) {
        plan.unmanaged++;
        continue;
      }
      winner = source;
    }

    if (conflictType) {
      const resolution = chooseResolution({
        strategy: input.strategy,
        type: conflictType,
        postgresUpdatedAt: input.postgresTimestamps?.get(key) ?? null,
        sheetModifiedAt: input.sheetModifiedAt ?? null,
      });
      const conflict: PlannedConflict = {
        key,
        type: conflictType,
        postgres: pgRow ?? null,
        sheets: sheetRef?.row ?? null,
        resolution,
        message: describeConflict(conflictType, key),
      };
      plan.conflicts.push(conflict);
      if (!resolution) {
        if (baseline) plan.nextBaseline.set(key, baseline);
        continue;
      }
      winner = resolution;
    }

    applyWinner(plan, key, winner!, pgRow, sheetRef, pgHash, sheetHash);
  }

  return plan;
}

function applyWinner(
  plan: SyncPlan,
  key: string,
  winner: Side,
  pgRow: CanonicalRow | undefined,
  sheetRef: { rowNumber: number; row: CanonicalRow } | undefined,
  pgHash: string | undefined,
  sheetHash: string | undefined,
) {
  if (winner === "POSTGRES") {
    if (pgRow) {
      if (sheetRef) plan.sheets.updates.push({ key, rowNumber: sheetRef.rowNumber, row: pgRow });
      else plan.sheets.inserts.push({ key, row: pgRow });
      plan.nextBaseline.set(key, pgHash!);
    } else if (sheetRef) {
      plan.sheets.deletes.push({ key, rowNumber: sheetRef.rowNumber });
    }
    return;
  }
  if (sheetRef) {
    if (pgRow) plan.postgres.updates.push({ key, row: sheetRef.row });
    else plan.postgres.inserts.push({ key, row: sheetRef.row });
    plan.nextBaseline.set(key, sheetHash!);
  } else if (pgRow) {
    plan.postgres.deletes.push({ key });
  }
}

export function planSummary(plan: SyncPlan) {
  return {
    postgres: {
      inserts: plan.postgres.inserts.length,
      updates: plan.postgres.updates.length,
      deletes: plan.postgres.deletes.length,
    },
    sheets: {
      inserts: plan.sheets.inserts.length,
      updates: plan.sheets.updates.length,
      deletes: plan.sheets.deletes.length,
    },
    conflicts: plan.conflicts.length,
    unresolvedConflicts: plan.conflicts.filter((conflict) => !conflict.resolution).length,
    unchanged: plan.unchanged,
    unmanaged: plan.unmanaged,
  };
}
