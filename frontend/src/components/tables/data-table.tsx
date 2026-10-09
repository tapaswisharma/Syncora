import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Filter, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useRowMutations, useTableRows } from "@/hooks/use-tables";
import { errorText } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes, formatNumber, pluralize } from "@/lib/format";
import type { FilterOperator, Row, RowFilter, TableMeta } from "@/types/api";
import { Cell, cellText, columnTypeLabel } from "./cell";
import { RowDialog } from "./row-dialog";

const PAGE_SIZES = [25, 50, 100, 200];
const operators: Array<{ value: FilterOperator; label: string; needsValue: boolean }> = [
  { value: "eq", label: "equals", needsValue: true },
  { value: "neq", label: "not equals", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "starts_with", label: "starts with", needsValue: true },
  { value: "gt", label: ">", needsValue: true },
  { value: "gte", label: "≥", needsValue: true },
  { value: "lt", label: "<", needsValue: true },
  { value: "lte", label: "≤", needsValue: true },
  { value: "is_null", label: "is NULL", needsValue: false },
  { value: "not_null", label: "is not NULL", needsValue: false },
];

/** Server-paginated table browser with sorting, filtering, search and row editing. */
export function DataTable({ connectionId, meta, database }: { connectionId: string; meta: TableMeta; database?: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<string | undefined>(undefined);
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [filters, setFilters] = useState<RowFilter[]>([]);
  const [draftFilter, setDraftFilter] = useState<RowFilter>({ column: meta.columns[0]?.name ?? "", op: "eq", value: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<Row | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row[] | null>(null);

  // Anything that changes which rows match sends the reader back to page 1.
  const changeSearch = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };
  const changeFilters = (next: RowFilter[]) => {
    setFilters(next);
    setPage(1);
  };
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const query = useTableRows(connectionId, meta.schema, meta.name, { database, page, pageSize, sort, order, search: search || undefined, filters });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? null;
  const pageCount = total !== null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const mutations = useRowMutations(connectionId, meta.schema, meta.name, database);
  const canEditRows = meta.editable && meta.primaryKey.length > 0;

  const rowKey = useMemo(
    () => (row: Row) => (meta.primaryKey.length ? meta.primaryKey.map((column) => String(row[column])).join("\u0000") : JSON.stringify(row)),
    [meta.primaryKey],
  );
  const keyOf = (row: Row): Row => Object.fromEntries(meta.primaryKey.map((column) => [column, row[column] ?? null]));
  const selectedRows = rows.filter((row) => selected.has(rowKey(row)));

  const toggleSort = (column: string) => {
    if (sort !== column) {
      setSort(column);
      setOrder("asc");
    } else if (order === "asc") {
      setOrder("desc");
    } else {
      setSort(undefined);
      setOrder("asc");
    }
  };

  const activeDeleteRows = confirmDelete ?? [];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-mono text-sm font-semibold">
            {meta.schema}.{meta.name}
          </h2>
          <p className="text-xs text-muted">
            {query.isLoading ? "Loading rows…" : total !== null ? `${query.data?.totalIsEstimate ? "~" : ""}${pluralize(total, "row")}` : "Row count unavailable"}
            {meta.sizeBytes ? ` · ${formatBytes(meta.sizeBytes)}` : ""}
            {meta.primaryKey.length ? ` · key: ${meta.primaryKey.join(", ")}` : " · no primary key"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
            <Input
              type="search"
              aria-label={`Search ${meta.name}`}
              placeholder="Search all columns…"
              value={searchInput}
              onChange={(event) => changeSearch(event.target.value)}
              className="h-8 w-44 pl-8 text-xs sm:w-56"
            />
          </div>
          <Button size="sm" variant={showFilters || filters.length ? "primary" : "outline"} onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}>
            <Filter aria-hidden className="size-3.5" /> Filters{filters.length ? ` (${filters.length})` : ""}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()} loading={query.isFetching && !query.isLoading} aria-label="Refresh rows">
            <RefreshCw aria-hidden className="size-3.5" /> Refresh
          </Button>
          {canEditRows ? (
            <Button size="sm" variant="primary" onClick={() => setEditingRow("new")}>
              <Plus aria-hidden className="size-3.5" /> Insert row
            </Button>
          ) : null}
        </div>
      </div>

      {showFilters ? (
        <div className="flex flex-wrap items-end gap-2 border-b border-border bg-surface-muted px-4 py-3">
          <label className="text-xs text-muted">
            Column
            <Select
              value={draftFilter.column}
              onChange={(event) => setDraftFilter({ ...draftFilter, column: event.target.value })}
              className="mt-1 h-8 w-40 text-xs"
            >
              {meta.columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-muted">
            Operator
            <Select
              value={draftFilter.op}
              onChange={(event) => setDraftFilter({ ...draftFilter, op: event.target.value as FilterOperator })}
              className="mt-1 h-8 w-36 text-xs"
            >
              {operators.map((operator) => (
                <option key={operator.value} value={operator.value}>
                  {operator.label}
                </option>
              ))}
            </Select>
          </label>
          {operators.find((operator) => operator.value === draftFilter.op)?.needsValue ? (
            <label className="text-xs text-muted">
              Value
              <Input
                value={draftFilter.value ?? ""}
                onChange={(event) => setDraftFilter({ ...draftFilter, value: event.target.value })}
                className="mt-1 h-8 w-40 text-xs"
              />
            </label>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              changeFilters([...filters, draftFilter]);
              setDraftFilter({ ...draftFilter, value: "" });
            }}
          >
            Add filter
          </Button>
          {filters.length ? (
            <Button size="sm" variant="ghost" onClick={() => changeFilters([])}>
              Clear all
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {filters.map((filter, index) => (
              <Badge key={`${filter.column}-${index}`} tone="primary" className="pr-1">
                <span className="font-mono">
                  {filter.column} {operators.find((operator) => operator.value === filter.op)?.label} {filter.value ?? ""}
                </span>
                <button
                  type="button"
                  aria-label={`Remove filter on ${filter.column}`}
                  className="rounded p-0.5 hover:bg-primary/40"
                  onClick={() => changeFilters(filters.filter((_, i) => i !== index))}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {selectedRows.length ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-secondary-soft px-4 py-2 text-sm text-secondary-ink">
          <span>{pluralize(selectedRows.length, "row")} selected</span>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(selectedRows)}>
            <Trash2 aria-hidden className="size-3.5" /> Delete selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      ) : null}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={8} />
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load rows" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Search className="size-5" />}
            title={search || filters.length ? "No rows match your filters" : "This table is empty"}
            description={
              search || filters.length
                ? "Try a different search term or remove some filters."
                : canEditRows
                  ? "Insert the first row, or sync data in from Google Sheets."
                  : "No rows to show yet."
            }
            action={
              search || filters.length ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    changeSearch("");
                    changeFilters([]);
                  }}
                >
                  Clear filters
                </Button>
              ) : canEditRows ? (
                <Button variant="primary" onClick={() => setEditingRow("new")}>
                  <Plus aria-hidden className="size-4" /> Insert row
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted">
              <tr>
                {canEditRows ? (
                  <th scope="col" className="w-10 border-b border-border px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all rows on this page"
                      className="accent-[#4f7fa3]"
                      checked={rows.length > 0 && rows.every((row) => selected.has(rowKey(row)))}
                      onChange={(event) => setSelected(event.target.checked ? new Set(rows.map(rowKey)) : new Set())}
                    />
                  </th>
                ) : null}
                {meta.columns.map((column) => (
                  <th key={column.name} scope="col" className="border-b border-border px-3 py-2 text-left font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort(column.name)}
                      title={columnTypeLabel(column)}
                      aria-label={`Sort by ${column.name}`}
                      className="group inline-flex items-center gap-1.5"
                    >
                      <span className={cn("font-mono text-xs", column.isPrimaryKey && "text-primary-ink")}>{column.name}</span>
                      {sort === column.name ? (
                        order === "asc" ? (
                          <ArrowUp aria-hidden className="size-3" />
                        ) : (
                          <ArrowDown aria-hidden className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown aria-hidden className="size-3 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                      )}
                    </button>
                    <span className="block text-[10px] font-normal text-subtle">{column.dataType}</span>
                  </th>
                ))}
                {canEditRows ? <th scope="col" className="w-20 border-b border-border px-3 py-2 text-right text-xs font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                return (
                  <tr key={key} className={cn("transition-colors hover:bg-surface-muted/60", selected.has(key) && "bg-primary-soft/60")}>
                    {canEditRows ? (
                      <td className="border-b border-border px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          className="accent-[#4f7fa3]"
                          checked={selected.has(key)}
                          onChange={(event) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(key);
                              else next.delete(key);
                              return next;
                            })
                          }
                        />
                      </td>
                    ) : null}
                    {meta.columns.map((column) => (
                      <td key={column.name} className="max-w-xs truncate border-b border-border px-3 py-2" title={cellText(row[column.name] ?? null)}>
                        <Cell value={row[column.name] ?? null} kind={column.kind} />
                      </td>
                    ))}
                    {canEditRows ? (
                      <td className="border-b border-border px-3 py-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" aria-label="Edit row" onClick={() => setEditingRow(row)}>
                          <Pencil aria-hidden className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" aria-label="Delete row" className="text-danger hover:text-danger" onClick={() => setConfirmDelete([row])}>
                          <Trash2 aria-hidden className="size-3.5" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs">
        <label className="flex items-center gap-2 whitespace-nowrap text-muted">
          Rows per page
          <Select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))} className="h-7 w-20 text-xs">
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-center gap-2">
          <span className="tabular text-muted">
            Page {page}
            {pageCount ? ` of ${formatNumber(pageCount)}` : ""}
          </span>
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page">
            <ChevronLeft aria-hidden className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pageCount ? page >= pageCount : rows.length < pageSize}
            onClick={() => setPage((value) => value + 1)}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>

      {editingRow !== null ? (
        <RowDialog
          open
          meta={meta}
          row={editingRow === "new" ? null : editingRow}
          submitting={mutations.insert.isPending || mutations.update.isPending}
          error={errorOrNull(editingRow === "new" ? mutations.insert.error : mutations.update.error)}
          onClose={() => {
            mutations.insert.reset();
            mutations.update.reset();
            setEditingRow(null);
          }}
          onSubmit={(values) => {
            if (editingRow === "new") {
              mutations.insert.mutate(values, {
                onSuccess: () => {
                  toast.success("Row inserted");
                  setEditingRow(null);
                },
              });
            } else {
              mutations.update.mutate(
                { key: keyOf(editingRow), values },
                {
                  onSuccess: () => {
                    toast.success("Row updated");
                    setEditingRow(null);
                  },
                },
              );
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        destructive
        title={`Delete ${pluralize(activeDeleteRows.length, "row")}?`}
        description="This runs a DELETE against your database and cannot be undone."
        confirmLabel={`Delete ${pluralize(activeDeleteRows.length, "row")}`}
        loading={mutations.remove.isPending}
        onConfirm={() =>
          mutations.remove.mutate(activeDeleteRows.map(keyOf), {
            onSuccess: (result) => {
              toast.success(`Deleted ${pluralize(result.deleted, "row")}`);
              setSelected(new Set());
              setConfirmDelete(null);
            },
            onError: (error) => toast.error(errorText(error)),
          })
        }
      >
        {activeDeleteRows.length <= 5 ? (
          <ul className="space-y-1 font-mono text-xs text-muted">
            {activeDeleteRows.map((row, index) => (
              <li key={index}>{meta.primaryKey.map((column) => `${column}=${cellText(row[column] ?? null)}`).join(", ")}</li>
            ))}
          </ul>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function errorOrNull(error: unknown): string | null {
  return error ? errorText(error) : null;
}
