import { describe, expect, it } from "vitest";
import { allowedStrategies, defaultHeader, suggestMappings, validateMapping } from "../src/services/sync/mapping.service.js";
import { customersTable } from "./fixtures.js";

const base = {
  table: customersTable,
  keyColumn: "id",
  direction: "BIDIRECTIONAL" as const,
  strategy: "MANUAL" as const,
  sheetHeaders: ["ID", "Name", "Email", "Created At"],
  mappings: [
    { pgColumn: "id", sheetColumn: "ID" },
    { pgColumn: "name", sheetColumn: "Name" },
    { pgColumn: "email", sheetColumn: "Email" },
    { pgColumn: "created_at", sheetColumn: "Created At" },
  ],
};

describe("validateMapping", () => {
  it("accepts a correct mapping", () => {
    const result = validateMapping(base);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("requires the row identifier to be mapped", () => {
    const result = validateMapping({ ...base, mappings: base.mappings.slice(1) });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/identifier column "id" must be mapped/);
  });

  it("rejects duplicate and unknown columns", () => {
    const result = validateMapping({
      ...base,
      mappings: [...base.mappings, { pgColumn: "name", sheetColumn: "name" }, { pgColumn: "nope", sheetColumn: "Nope" }],
    });
    expect(result.errors.some((e) => e.includes('"name" is mapped more than once'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"Name" is mapped more than once') || e.includes('"name" is mapped more than once'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"nope" does not exist'))).toBe(true);
  });

  it("refuses to write generated columns from Sheets", () => {
    const mappings = [...base.mappings, { pgColumn: "full_name", sheetColumn: "Full Name" }];
    expect(validateMapping({ ...base, mappings }).valid).toBe(false);
    expect(validateMapping({ ...base, mappings, direction: "POSTGRES_TO_SHEETS", strategy: "POSTGRES_WINS" }).valid).toBe(true);
  });

  it("requires mapped headers to exist when only reading from Sheets", () => {
    const sheetHeaders = ["ID", "Name"];
    const oneWay = validateMapping({ ...base, sheetHeaders, direction: "SHEETS_TO_POSTGRES", strategy: "GOOGLE_SHEETS_WINS" });
    expect(oneWay.valid).toBe(false);
    const twoWay = validateMapping({ ...base, sheetHeaders });
    expect(twoWay.valid).toBe(true);
    expect(twoWay.warnings.join(" ")).toMatch(/will be added/);
  });

  it("only allows source-wins or manual strategies for one-way syncs", () => {
    expect(allowedStrategies("POSTGRES_TO_SHEETS")).toEqual(["POSTGRES_WINS", "MANUAL"]);
    expect(validateMapping({ ...base, direction: "POSTGRES_TO_SHEETS", strategy: "GOOGLE_SHEETS_WINS" }).valid).toBe(false);
  });

  it("validates the timestamp column for last-write-wins", () => {
    expect(validateMapping({ ...base, strategy: "LAST_WRITE_WINS", timestampColumn: "name" }).valid).toBe(false);
    expect(validateMapping({ ...base, strategy: "LAST_WRITE_WINS", timestampColumn: "created_at" }).valid).toBe(true);
    expect(validateMapping({ ...base, strategy: "LAST_WRITE_WINS" }).warnings.join(" ")).toMatch(/timestamp column/);
  });

  it("rejects JSON identifiers", () => {
    const result = validateMapping({ ...base, keyColumn: "settings", mappings: [...base.mappings, { pgColumn: "settings", sheetColumn: "Settings" }] });
    expect(result.errors.join(" ")).toMatch(/cannot be used as the row identifier/);
  });
});

describe("mapping suggestions", () => {
  it("matches snake_case columns to friendly headers", () => {
    expect(suggestMappings(["id", "created_at", "email", "missing"], ["ID", "Created At", "E-mail", "Email"])).toEqual([
      { pgColumn: "id", sheetColumn: "ID" },
      { pgColumn: "created_at", sheetColumn: "Created At" },
      { pgColumn: "email", sheetColumn: "E-mail" },
    ]);
  });

  it("builds readable default headers", () => {
    expect(defaultHeader("created_at")).toBe("Created At");
    expect(defaultHeader("monthlyRevenue")).toBe("Monthly Revenue");
  });
});
