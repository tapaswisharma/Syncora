import { describe, expect, it } from "vitest";
import { allowedStrategies, autoMap, defaultHeader } from "./mapping";

describe("autoMap", () => {
  it("reuses existing headers and invents friendly ones for the rest", () => {
    expect(autoMap(["id", "created_at", "plan"], ["ID", "Created At"])).toEqual([
      { pgColumn: "id", sheetColumn: "ID" },
      { pgColumn: "created_at", sheetColumn: "Created At" },
      { pgColumn: "plan", sheetColumn: "Plan" },
    ]);
  });
  it("never maps two columns to the same existing header", () => {
    const result = autoMap(["name", "name2"], ["Name", "Name"]);
    expect(new Set(result.map((m) => m.sheetColumn)).size).toBe(2);
  });
});

describe("defaultHeader / allowedStrategies", () => {
  it("formats headers", () => {
    expect(defaultHeader("monthly_revenue")).toBe("Monthly Revenue");
  });
  it("restricts strategies for one-way syncs", () => {
    expect(allowedStrategies("SHEETS_TO_POSTGRES")).toEqual(["GOOGLE_SHEETS_WINS", "MANUAL"]);
    expect(allowedStrategies("BIDIRECTIONAL")).toHaveLength(4);
  });
});
