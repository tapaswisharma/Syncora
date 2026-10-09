import { describe, expect, it } from "vitest";
import { chooseResolution } from "../src/services/sync/conflict.service.js";
import { planSync } from "../src/services/sync/sync-planner.js";
import type { CanonicalRow, PlanInput, SheetRowRef } from "../src/services/sync/types.js";
import { canonicalize, rowHash, toPgParam, toSheetCell } from "../src/services/sync/value-codec.js";

const columns = ["id", "name"];
const row = (id: string, name: string): CanonicalRow => ({ id, name });
const pgMap = (...rows: CanonicalRow[]) => new Map(rows.map((r) => [r.id!, r]));
const sheetMap = (...rows: CanonicalRow[]): Map<string, SheetRowRef> =>
  new Map(rows.map((r, i) => [r.id!, { rowNumber: i + 2, row: r }]));
const baseline = (...rows: CanonicalRow[]) => new Map(rows.map((r) => [r.id!, rowHash(r, columns)]));

function plan(input: Partial<PlanInput>) {
  return planSync({
    direction: "BIDIRECTIONAL",
    strategy: "MANUAL",
    columns,
    postgres: new Map(),
    sheets: new Map(),
    baseline: new Map(),
    ...input,
  });
}

describe("value canonicalization (row identification and comparison)", () => {
  it("treats equivalent numbers from both sides as equal", () => {
    expect(canonicalize("10.50", "number")).toBe(canonicalize(10.5, "number"));
    expect(canonicalize("007", "integer")).toBe("7");
    expect(canonicalize("9007199254740993", "integer")).toBe("9007199254740993");
  });

  it("normalizes booleans, nulls and JSON", () => {
    expect(canonicalize(true, "boolean")).toBe("true");
    expect(canonicalize("FALSE", "boolean")).toBe("false");
    expect(canonicalize(null, "text")).toBe("");
    expect(canonicalize({ b: 1, a: 2 }, "json")).toBe(canonicalize('{"a":2,"b":1}', "json"));
  });

  it("normalizes PostgreSQL timestamptz text and ISO strings to the same instant", () => {
    expect(canonicalize("2024-01-01 10:00:00+00", "timestamptz")).toBe("2024-01-01T10:00:00.000Z");
    expect(canonicalize("2024-01-01T15:30:00+05:30", "timestamptz")).toBe("2024-01-01T10:00:00.000Z");
    expect(canonicalize("2024-01-01 10:00:00", "timestamp")).toBe("2024-01-01T10:00:00.000");
  });

  it("writes typed cells to Sheets and NULLs to PostgreSQL", () => {
    expect(toSheetCell("42", "integer")).toBe(42);
    expect(toSheetCell("9007199254740993", "integer")).toBe("9007199254740993");
    expect(toSheetCell("true", "boolean")).toBe(true);
    expect(toSheetCell("=HYPERLINK(\"x\")", "text")).toBe("=HYPERLINK(\"x\")");
    expect(toPgParam("", "integer")).toBeNull();
    expect(toPgParam('["a","b"]', "array")).toEqual(["a", "b"]);
  });

  it("hashes rows independently of column order", () => {
    expect(rowHash({ id: "1", name: "a" }, ["id", "name"])).toBe(rowHash({ name: "a", id: "1" }, ["name", "id"]));
  });
});

describe("planSync", () => {
  it("first PostgreSQL → Sheets sync appends every row", () => {
    const result = plan({ direction: "POSTGRES_TO_SHEETS", strategy: "POSTGRES_WINS", postgres: pgMap(row("1", "Ada"), row("2", "Grace")) });
    expect(result.sheets.inserts.map((i) => i.key)).toEqual(["1", "2"]);
    expect(result.nextBaseline.size).toBe(2);
  });

  it("propagates one-sided changes in both directions", () => {
    const base = baseline(row("1", "Ada"), row("2", "Grace"));
    const result = plan({
      postgres: pgMap(row("1", "Ada L."), row("2", "Grace")),
      sheets: sheetMap(row("1", "Ada"), row("2", "Rear Admiral Grace")),
      baseline: base,
    });
    expect(result.sheets.updates).toEqual([{ key: "1", rowNumber: 2, row: row("1", "Ada L.") }]);
    expect(result.postgres.updates).toEqual([{ key: "2", row: row("2", "Rear Admiral Grace") }]);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects a conflict when both sides changed and leaves it open under MANUAL", () => {
    const result = plan({
      postgres: pgMap(row("1", "From PG")),
      sheets: sheetMap(row("1", "From Sheets")),
      baseline: baseline(row("1", "Original")),
    });
    expect(result.conflicts).toMatchObject([{ key: "1", type: "UPDATE_UPDATE", resolution: null }]);
    expect(result.sheets.updates).toHaveLength(0);
    expect(result.postgres.updates).toHaveLength(0);
    expect(result.nextBaseline.get("1")).toBe(rowHash(row("1", "Original"), columns));
  });

  it("resolves conflicts with POSTGRES_WINS and records them", () => {
    const result = plan({
      strategy: "POSTGRES_WINS",
      postgres: pgMap(row("1", "From PG")),
      sheets: sheetMap(row("1", "From Sheets")),
      baseline: baseline(row("1", "Original")),
    });
    expect(result.conflicts[0]?.resolution).toBe("POSTGRES");
    expect(result.sheets.updates[0]?.row.name).toBe("From PG");
  });

  it("propagates deletions of previously synced rows", () => {
    const result = plan({
      postgres: pgMap(row("1", "Ada")),
      sheets: sheetMap(row("1", "Ada"), row("2", "Grace")),
      baseline: baseline(row("1", "Ada"), row("2", "Grace")),
    });
    expect(result.sheets.deletes).toEqual([{ key: "2", rowNumber: 3 }]);
    expect(result.nextBaseline.has("2")).toBe(false);
  });

  it("flags delete-vs-update as a conflict", () => {
    const result = plan({
      postgres: pgMap(),
      sheets: sheetMap(row("1", "Edited")),
      baseline: baseline(row("1", "Ada")),
    });
    expect(result.conflicts[0]?.type).toBe("DELETE_UPDATE");
  });

  it("never touches destination-only rows that were never synced in one-way mode", () => {
    const result = plan({
      direction: "POSTGRES_TO_SHEETS",
      strategy: "POSTGRES_WINS",
      postgres: pgMap(row("1", "Ada")),
      sheets: sheetMap(row("1", "Ada"), row("99", "Hand-written")),
    });
    expect(result.sheets.deletes).toHaveLength(0);
    expect(result.unmanaged).toBe(1);
  });

  it("reverts edits on the destination side of a one-way sync", () => {
    const result = plan({
      direction: "POSTGRES_TO_SHEETS",
      strategy: "POSTGRES_WINS",
      postgres: pgMap(row("1", "Ada")),
      sheets: sheetMap(row("1", "Typo")),
      baseline: baseline(row("1", "Ada")),
    });
    expect(result.sheets.updates[0]?.row.name).toBe("Ada");
    expect(result.postgres.updates).toHaveLength(0);
  });

  it("skips excluded (duplicate) keys but keeps their baseline", () => {
    const result = plan({
      postgres: pgMap(row("1", "Ada")),
      sheets: sheetMap(row("1", "Changed")),
      baseline: baseline(row("1", "Ada")),
      excludedKeys: new Set(["1"]),
    });
    expect(result.postgres.updates).toHaveLength(0);
    expect(result.nextBaseline.get("1")).toBe(rowHash(row("1", "Ada"), columns));
  });
});

describe("chooseResolution", () => {
  const pgTime = new Date("2024-01-02T00:00:00Z");
  const sheetTime = new Date("2024-01-01T00:00:00Z");
  it("last write wins compares timestamps and falls back to manual without them", () => {
    expect(chooseResolution({ strategy: "LAST_WRITE_WINS", type: "UPDATE_UPDATE", postgresUpdatedAt: pgTime, sheetModifiedAt: sheetTime })).toBe("POSTGRES");
    expect(chooseResolution({ strategy: "LAST_WRITE_WINS", type: "UPDATE_UPDATE", postgresUpdatedAt: sheetTime, sheetModifiedAt: pgTime })).toBe("SHEETS");
    expect(chooseResolution({ strategy: "LAST_WRITE_WINS", type: "UPDATE_UPDATE", postgresUpdatedAt: null, sheetModifiedAt: pgTime })).toBeNull();
  });
  it("keeps the edited row in delete-vs-update conflicts", () => {
    expect(chooseResolution({ strategy: "LAST_WRITE_WINS", type: "DELETE_UPDATE", postgresUpdatedAt: null, sheetModifiedAt: null })).toBe("SHEETS");
  });
});
