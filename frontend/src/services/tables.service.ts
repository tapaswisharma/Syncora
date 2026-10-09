import { api } from "@/lib/api";
import type { Row, RowFilter, RowsPage, SchemaInfo, TableInfo, TableMeta } from "@/types/api";

const base = (connectionId: string, schema: string, table: string) =>
  `/connections/${connectionId}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`;

export interface RowParams {
  database?: string;
  page: number;
  pageSize: number;
  sort?: string;
  order: "asc" | "desc";
  search?: string;
  filters: RowFilter[];
}

export const tablesService = {
  databases: (connectionId: string) => api<{ databases: string[] }>(`/connections/${connectionId}/databases`).then((r) => r.databases),
  schemas: (connectionId: string, database?: string) =>
    api<{ schemas: SchemaInfo[] }>(`/connections/${connectionId}/schemas`, { query: { database } }).then((r) => r.schemas),
  tables: (connectionId: string, schema: string, database?: string) =>
    api<{ tables: TableInfo[] }>(`/connections/${connectionId}/tables`, { query: { schema, database } }).then((r) => r.tables),
  table: (connectionId: string, schema: string, table: string, database?: string) =>
    api<{ table: TableMeta }>(base(connectionId, schema, table), { query: { database } }).then((r) => r.table),
  rows: (connectionId: string, schema: string, table: string, params: RowParams, signal?: AbortSignal) =>
    api<RowsPage>(`${base(connectionId, schema, table)}/rows`, {
      signal,
      query: {
        database: params.database,
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort,
        order: params.order,
        search: params.search,
        filters: params.filters.length ? JSON.stringify(params.filters) : undefined,
      },
    }),
  insertRow: (connectionId: string, schema: string, table: string, values: Row, database?: string) =>
    api<{ row: Row }>(`${base(connectionId, schema, table)}/rows`, { method: "POST", body: { values }, query: { database } }).then((r) => r.row),
  updateRow: (connectionId: string, schema: string, table: string, key: Row, values: Row, database?: string) =>
    api<{ row: Row }>(`${base(connectionId, schema, table)}/rows`, { method: "PATCH", body: { key, values }, query: { database } }).then((r) => r.row),
  deleteRows: (connectionId: string, schema: string, table: string, keys: Row[], database?: string) =>
    api<{ deleted: number }>(`${base(connectionId, schema, table)}/rows`, { method: "DELETE", body: { keys }, query: { database } }),
};
