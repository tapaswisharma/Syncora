import { ChevronRight, Database, Layers, Plug, Table2 } from "lucide-react";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/tables/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useConnections } from "@/hooks/use-connections";
import { useDatabases, useSchemas, useTableMeta, useTables } from "@/hooks/use-tables";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useUiStore } from "@/stores/ui-store";

export default function DatabasesPage() {
  const connections = useConnections();
  const explorer = useUiStore((state) => state.explorer);
  const { selectConnection, selectDatabase, selectSchema, selectTable } = useUiStore.getState();

  // Default to the first connection, and keep a stale selection from sticking around.
  useEffect(() => {
    if (!connections.data) return;
    const exists = connections.data.some((connection) => connection.id === explorer.connectionId);
    if (!exists) selectConnection(connections.data[0]?.id ?? null);
  }, [connections.data, explorer.connectionId, selectConnection]);

  const connectionId = explorer.connectionId;
  const databases = useDatabases(connectionId);
  const schemas = useSchemas(connectionId, explorer.database ?? undefined);
  const schema = explorer.schema ?? schemas.data?.[0]?.name ?? null;
  const tables = useTables(connectionId, schema, explorer.database ?? undefined);
  const tableMeta = useTableMeta(connectionId, schema, explorer.table, explorer.database ?? undefined);

  useEffect(() => {
    if (schemas.data && !explorer.schema && schemas.data[0]) selectSchema(schemas.data[0].name);
  }, [schemas.data, explorer.schema, selectSchema]);

  if (connections.isLoading) return <SkeletonRows rows={6} />;
  if (connections.isError) return <ErrorState error={connections.error} onRetry={() => void connections.refetch()} />;

  if (!connections.data?.length) {
    return (
      <>
        <PageHeader title="Databases" description="Browse schemas, tables and rows in your PostgreSQL connections." />
        <Card>
          <EmptyState
            icon={<Plug className="size-5" />}
            title="No PostgreSQL connections yet"
            description="Add a connection first, then come back to explore its schemas and tables."
            action={<LinkButton to="/connections">Add a connection</LinkButton>}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Databases"
        description="Browse schemas and tables, then view, filter and edit rows. Data is paginated on the server."
        actions={
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="explorer-connection">
              Connection
            </label>
            <Select id="explorer-connection" value={connectionId ?? ""} onChange={(event) => selectConnection(event.target.value)} className="w-48">
              {connections.data.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name}
                </option>
              ))}
            </Select>
            {databases.data && databases.data.length > 1 ? (
              <>
                <label className="sr-only" htmlFor="explorer-database">
                  Database
                </label>
                <Select id="explorer-database" value={explorer.database ?? ""} onChange={(event) => selectDatabase(event.target.value || null)} className="w-40">
                  <option value="">Default database</option>
                  {databases.data.map((database) => (
                    <option key={database} value={database}>
                      {database}
                    </option>
                  ))}
                </Select>
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="flex max-h-[32rem] min-w-0 flex-col lg:max-h-[calc(100dvh-14rem)]">
          <div className="border-b border-border px-4 py-3">
            <label htmlFor="explorer-schema" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Layers aria-hidden className="size-3.5" /> Schema
            </label>
            <Select id="explorer-schema" value={schema ?? ""} onChange={(event) => selectSchema(event.target.value)} disabled={schemas.isLoading}>
              {schemas.data?.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.tableCount})
                </option>
              ))}
            </Select>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
            {tables.isLoading ? (
              <div className="p-2">
                <SkeletonRows rows={6} />
              </div>
            ) : tables.isError ? (
              <div className="p-2">
                <ErrorState error={tables.error} onRetry={() => void tables.refetch()} title="Could not list tables" />
              </div>
            ) : tables.data?.length ? (
              <ul className="space-y-0.5">
                {tables.data.map((table) => (
                  <li key={table.name}>
                    <button
                      type="button"
                      onClick={() => selectTable(table.name)}
                      aria-current={explorer.table === table.name}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        explorer.table === table.name ? "bg-primary-soft font-medium text-primary-ink" : "text-muted hover:bg-surface-muted hover:text-text",
                      )}
                    >
                      <Table2 aria-hidden className="size-3.5 shrink-0" />
                      <span className="flex-1 truncate font-mono text-xs">{table.name}</span>
                      {table.type !== "table" ? (
                        <Badge className="shrink-0 text-[10px]">{table.type === "materialized_view" ? "matview" : table.type}</Badge>
                      ) : table.estimatedRows !== null ? (
                        <span className="tabular shrink-0 text-[10px] text-subtle">~{formatNumber(table.estimatedRows)}</span>
                      ) : null}
                      <ChevronRight aria-hidden className="size-3 shrink-0 opacity-40" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Database className="size-5" />} title="No tables in this schema" description="Pick another schema, or create a table in your database." />
            )}
          </div>
        </Card>

        <Card className="flex min-h-[28rem] min-w-0 flex-col lg:max-h-[calc(100dvh-14rem)]">
          {!explorer.table ? (
            <EmptyState icon={<Table2 className="size-5" />} title="Select a table" description="Pick a table on the left to view and edit its rows." className="flex-1" />
          ) : tableMeta.isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Loading table…" />
            </div>
          ) : tableMeta.isError ? (
            <div className="p-4">
              <ErrorState error={tableMeta.error} onRetry={() => void tableMeta.refetch()} title="Could not load the table" />
            </div>
          ) : tableMeta.data ? (
            // Keying by table resets paging, sorting and filters when another table is opened.
            <DataTable
              key={`${connectionId}:${explorer.database ?? ""}:${tableMeta.data.schema}.${tableMeta.data.name}`}
              connectionId={connectionId!}
              meta={tableMeta.data}
              database={explorer.database ?? undefined}
            />
          ) : null}
        </Card>
      </div>
    </>
  );
}
