import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { tablesService, type RowParams } from "@/services/tables.service";
import type { Row } from "@/types/api";

export function useDatabases(connectionId: string | null) {
  return useQuery({
    queryKey: queryKeys.databases(connectionId ?? ""),
    queryFn: () => tablesService.databases(connectionId!),
    enabled: Boolean(connectionId),
    staleTime: 5 * 60_000,
  });
}

export function useSchemas(connectionId: string | null, database?: string) {
  return useQuery({
    queryKey: queryKeys.schemas(connectionId ?? "", database),
    queryFn: () => tablesService.schemas(connectionId!, database),
    enabled: Boolean(connectionId),
    staleTime: 60_000,
  });
}

export function useTables(connectionId: string | null, schema: string | null, database?: string) {
  return useQuery({
    queryKey: queryKeys.tables(connectionId ?? "", schema ?? "", database),
    queryFn: () => tablesService.tables(connectionId!, schema!, database),
    enabled: Boolean(connectionId && schema),
    staleTime: 60_000,
  });
}

export function useTableMeta(connectionId: string | null, schema: string | null, table: string | null, database?: string) {
  return useQuery({
    queryKey: queryKeys.table(connectionId ?? "", schema ?? "", table ?? "", database),
    queryFn: () => tablesService.table(connectionId!, schema!, table!, database),
    enabled: Boolean(connectionId && schema && table),
    staleTime: 60_000,
  });
}

export function useTableRows(connectionId: string | null, schema: string | null, table: string | null, params: RowParams) {
  return useQuery({
    queryKey: queryKeys.tableRows(connectionId ?? "", schema ?? "", table ?? "", params),
    queryFn: ({ signal }) => tablesService.rows(connectionId!, schema!, table!, params, signal),
    enabled: Boolean(connectionId && schema && table),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

/** Row mutations invalidate every cached page for the table (rows are keyed under the connection). */
export function useRowMutations(connectionId: string, schema: string, table: string, database?: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ["connections", connectionId, "rows", database ?? null, schema, table] });
  return {
    insert: useMutation({
      mutationFn: (values: Row) => tablesService.insertRow(connectionId, schema, table, values, database),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ key, values }: { key: Row; values: Row }) => tablesService.updateRow(connectionId, schema, table, key, values, database),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (keys: Row[]) => tablesService.deleteRows(connectionId, schema, table, keys, database),
      onSuccess: () => {
        void invalidate();
        void client.invalidateQueries({ queryKey: queryKeys.activityLogs });
      },
    }),
  };
}
