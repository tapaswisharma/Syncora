import { errorMessage } from "../../utils/errors.js";
import { sheetsService, type SheetCell } from "../google/sheets.service.js";
import type { SideCounts } from "../../db/schema.js";
import { normalizeHeader, type SheetSnapshot, type SyncContext } from "./sync-context.js";
import type { CanonicalRow, SyncPlan } from "./types.js";
import { toSheetCell } from "./value-codec.js";

export interface SheetWriteResult extends SideCounts {
  failed: Map<string, string>;
}

/** Makes sure every mapped column has a header cell; returns the column index for each mapping. */
async function ensureHeaders(context: SyncContext, snapshot: SheetSnapshot): Promise<number[]> {
  const headers = [...snapshot.headers];
  const index = new Map(snapshot.headerIndex);
  let changed = false;
  for (const mapping of context.mappings) {
    if (!index.has(normalizeHeader(mapping.sheetColumn))) {
      // Reuse a trailing empty header cell if there is one, otherwise append.
      const emptySlot = headers.findIndex((header) => header === "");
      const position = emptySlot >= 0 ? emptySlot : headers.length;
      headers[position] = mapping.sheetColumn;
      index.set(normalizeHeader(mapping.sheetColumn), position);
      changed = true;
    }
  }
  if (changed) {
    await sheetsService.writeHeaders(context.userId, context.config.spreadsheetId, context.config.worksheetTitle, headers);
    snapshot.headers = headers;
    snapshot.headerIndex = index;
  }
  return context.mappings.map((mapping) => index.get(normalizeHeader(mapping.sheetColumn))!);
}

function buildRow(context: SyncContext, indexes: number[], width: number, row: CanonicalRow, base: SheetCell[] = []): SheetCell[] {
  const cells: SheetCell[] = Array.from({ length: Math.max(width, base.length) }, (_, i) => base[i] ?? "");
  context.columns.forEach((column, position) => {
    cells[indexes[position]!] = toSheetCell(row[column.name] ?? "", column.kind);
  });
  return cells;
}

/** Applies planned changes to the worksheet: in-place updates, then deletions (bottom-up), then appends. */
export async function applySheetChanges(
  context: SyncContext,
  snapshot: SheetSnapshot,
  changes: SyncPlan["sheets"],
  keyWritebacks: Array<{ rowNumber: number; key: string; row: CanonicalRow }> = [],
): Promise<SheetWriteResult> {
  const result: SheetWriteResult = { inserted: 0, updated: 0, deleted: 0, failed: new Map() };
  const total = changes.inserts.length + changes.updates.length + changes.deletes.length + keyWritebacks.length;
  if (total === 0) return result;

  const { userId, config } = context;
  const stages: Array<{ keys: string[]; run: () => Promise<void> }> = [];
  let indexes: number[] = [];

  stages.push({
    keys: [...changes.updates.map((u) => u.key), ...keyWritebacks.map((w) => w.key)],
    run: async () => {
      indexes = await ensureHeaders(context, snapshot);
      const width = snapshot.headers.length;
      const updates = [
        ...changes.updates.map((update) => ({
          rowNumber: update.rowNumber,
          values: buildRow(context, indexes, width, update.row, snapshot.rawRows.get(update.rowNumber)),
        })),
        ...keyWritebacks.map((writeback) => ({
          rowNumber: writeback.rowNumber,
          values: buildRow(context, indexes, width, writeback.row, snapshot.rawRows.get(writeback.rowNumber)),
        })),
      ];
      await sheetsService.updateRows(userId, config.spreadsheetId, config.worksheetTitle, updates);
      result.updated += changes.updates.length;
    },
  });
  stages.push({
    keys: changes.deletes.map((d) => d.key),
    run: async () => {
      await sheetsService.deleteRows(userId, config.spreadsheetId, config.worksheetId, changes.deletes.map((d) => d.rowNumber));
      result.deleted += changes.deletes.length;
    },
  });
  stages.push({
    keys: changes.inserts.map((i) => i.key),
    run: async () => {
      const width = snapshot.headers.length;
      await sheetsService.appendRows(
        userId,
        config.spreadsheetId,
        config.worksheetTitle,
        changes.inserts.map((insert) => buildRow(context, indexes, width, insert.row)),
      );
      result.inserted += changes.inserts.length;
    },
  });

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    if (!stage.keys.length && i > 0) continue;
    try {
      await stage.run();
    } catch (error) {
      // Row numbers are unreliable after a failed batch, so the remaining stages are skipped.
      const message = errorMessage(error);
      for (const remaining of stages.slice(i)) for (const key of remaining.keys) result.failed.set(key, message);
      break;
    }
  }
  return result;
}
