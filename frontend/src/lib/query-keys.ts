import type { RowFilter } from "@/types/api";

/** Central React Query keys. Hierarchical so related data can be invalidated together. */
export const queryKeys = {
  config: ["config"] as const,
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  connections: ["connections"] as const,
  connection: (id: string) => ["connections", id] as const,
  databases: (connectionId: string) => ["connections", connectionId, "databases"] as const,
  schemas: (connectionId: string, database?: string) => ["connections", connectionId, "schemas", database ?? null] as const,
  tables: (connectionId: string, schema: string, database?: string) => ["connections", connectionId, "tables", database ?? null, schema] as const,
  table: (connectionId: string, schema: string, table: string, database?: string) =>
    ["connections", connectionId, "table", database ?? null, schema, table] as const,
  tableRows: (
    connectionId: string,
    schema: string,
    table: string,
    params: { database?: string; page: number; pageSize: number; sort?: string; order: string; search?: string; filters: RowFilter[] },
  ) => ["connections", connectionId, "rows", params.database ?? null, schema, table, params] as const,
  googleStatus: ["google", "status"] as const,
  googleHealth: ["google", "health"] as const,
  spreadsheets: (search: string) => ["google", "spreadsheets", search] as const,
  spreadsheet: (id: string) => ["google", "spreadsheet", id] as const,
  worksheetPreview: (spreadsheetId: string, worksheetId: number, pgColumns: string) => ["google", "preview", spreadsheetId, worksheetId, pgColumns] as const,
  syncConfigurations: ["syncs"] as const,
  syncConfiguration: (id: string) => ["syncs", id] as const,
  syncRun: (id: string) => ["runs", id] as const,
  syncHistory: (params: { syncId?: string; status?: string; offset: number }) => ["history", params] as const,
  conflicts: (params: { status?: string; syncId?: string }) => ["conflicts", params] as const,
  activityLogs: ["activity"] as const,
};
