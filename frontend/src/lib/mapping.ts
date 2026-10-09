import type { ColumnMapping, ConflictStrategy, SyncDirection } from "@/types/api";

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Converts snake_case / camelCase to a friendly sheet header (created_at -> Created At). */
export function defaultHeader(column: string): string {
  return column
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/** Matches PostgreSQL columns to existing sheet headers, falling back to a friendly header. */
export function autoMap(pgColumns: string[], sheetHeaders: string[]): ColumnMapping[] {
  const available = new Map<string, string>();
  for (const header of sheetHeaders) {
    if (header && !available.has(squash(header))) available.set(squash(header), header);
  }
  return pgColumns.map((column) => {
    const match = available.get(squash(column));
    if (match) available.delete(squash(column));
    return { pgColumn: column, sheetColumn: match ?? defaultHeader(column) };
  });
}

export const directionLabels: Record<SyncDirection, { title: string; description: string }> = {
  POSTGRES_TO_SHEETS: { title: "PostgreSQL → Google Sheets", description: "The database is the source of truth. Sheet edits are overwritten." },
  SHEETS_TO_POSTGRES: { title: "Google Sheets → PostgreSQL", description: "The spreadsheet is the source of truth. Database edits are overwritten." },
  BIDIRECTIONAL: { title: "Bidirectional", description: "Changes flow both ways. Edits to the same row on both sides become conflicts." },
};

export const strategyLabels: Record<ConflictStrategy, { title: string; description: string }> = {
  MANUAL: { title: "Review manually", description: "Conflicting rows are recorded and left untouched until you choose a side." },
  LAST_WRITE_WINS: { title: "Last write wins", description: "Compares the row's timestamp column with the spreadsheet's last-modified time." },
  POSTGRES_WINS: { title: "PostgreSQL wins", description: "The database version is kept and written over the sheet." },
  GOOGLE_SHEETS_WINS: { title: "Google Sheets wins", description: "The sheet version is kept and written into the database." },
};

export function allowedStrategies(direction: SyncDirection): ConflictStrategy[] {
  if (direction === "POSTGRES_TO_SHEETS") return ["POSTGRES_WINS", "MANUAL"];
  if (direction === "SHEETS_TO_POSTGRES") return ["GOOGLE_SHEETS_WINS", "MANUAL"];
  return ["LAST_WRITE_WINS", "POSTGRES_WINS", "GOOGLE_SHEETS_WINS", "MANUAL"];
}
