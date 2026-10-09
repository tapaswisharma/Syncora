import { CircleCheck, Database, FileSpreadsheet, GitCompareArrows, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RelativeTime } from "@/components/ui/relative-time";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useConflicts, useResolveConflict } from "@/hooks/use-sync";
import { errorText } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { SyncConflict } from "@/types/api";

const typeLabels: Record<SyncConflict["type"], string> = {
  UPDATE_UPDATE: "Changed on both sides",
  UPDATE_DELETE: "Changed in PostgreSQL, deleted in Sheets",
  DELETE_UPDATE: "Deleted in PostgreSQL, changed in Sheets",
  INSERT_INSERT: "Added on both sides",
};

function ValueTable({ conflict }: { conflict: SyncConflict }) {
  const columns = [...new Set([...Object.keys(conflict.postgresValues ?? {}), ...Object.keys(conflict.sheetValues ?? {})])];
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className="px-3 py-1.5 text-left font-medium">
              Column
            </th>
            <th scope="col" className="px-3 py-1.5 text-left font-medium">
              <span className="inline-flex items-center gap-1">
                <Database aria-hidden className="size-3 text-primary-strong" /> PostgreSQL
              </span>
            </th>
            <th scope="col" className="px-3 py-1.5 text-left font-medium">
              <span className="inline-flex items-center gap-1">
                <FileSpreadsheet aria-hidden className="size-3 text-success-strong" /> Google Sheets
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => {
            const left = conflict.postgresValues?.[column];
            const right = conflict.sheetValues?.[column];
            const differs = left !== right;
            return (
              <tr key={column} className={cn("border-t border-border", differs && "bg-secondary-soft/60")}>
                <td className="px-3 py-1.5 font-mono">{column}</td>
                <td className="px-3 py-1.5 font-mono">{conflict.postgresValues ? left || <span className="text-subtle italic">empty</span> : <span className="text-subtle italic">row deleted</span>}</td>
                <td className="px-3 py-1.5 font-mono">{conflict.sheetValues ? right || <span className="text-subtle italic">empty</span> : <span className="text-subtle italic">row deleted</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ConflictsPage() {
  const [tab, setTab] = useState<"OPEN" | "RESOLVED">("OPEN");
  const conflicts = useConflicts({ status: tab });
  const resolve = useResolveConflict();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const act = (conflict: SyncConflict, choice: "POSTGRES" | "SHEETS" | "DISMISS") => {
    setPendingId(conflict.id);
    resolve.mutate(
      { id: conflict.id, choice },
      {
        onSuccess: () => toast.success(choice === "DISMISS" ? "Conflict dismissed" : `Kept the ${choice === "POSTGRES" ? "PostgreSQL" : "Google Sheets"} version`),
        onError: (error) => toast.error(errorText(error)),
        onSettled: () => setPendingId(null),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Conflicts"
        description="Rows that changed on both sides since the last sync. Nothing is overwritten until a side is chosen."
        actions={
          <div role="tablist" aria-label="Conflict status" className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
            {(["OPEN", "RESOLVED"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", tab === value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
              >
                {value === "OPEN" ? "Needs review" : "Resolved"}
              </button>
            ))}
          </div>
        }
      />
      {conflicts.isLoading ? (
        <SkeletonRows rows={4} />
      ) : conflicts.isError ? (
        <ErrorState error={conflicts.error} onRetry={() => void conflicts.refetch()} />
      ) : conflicts.data?.length ? (
        <ul className="space-y-4">
          {conflicts.data.map((conflict) => (
            <li key={conflict.id}>
              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/syncs/${conflict.syncConfigurationId}`} className="text-sm font-semibold hover:underline">
                        {conflict.syncName}
                      </Link>
                      <Badge tone="warning">{typeLabels[conflict.type]}</Badge>
                      {conflict.status !== "OPEN" ? (
                        <Badge tone={conflict.status === "DISMISSED" ? "neutral" : "success"}>
                          {conflict.status === "RESOLVED_AUTO" ? `Auto: kept ${conflict.resolution === "POSTGRES" ? "PostgreSQL" : "Sheets"}` : conflict.status === "DISMISSED" ? "Dismissed" : `Kept ${conflict.resolution === "POSTGRES" ? "PostgreSQL" : "Sheets"}`}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {conflict.schemaName}.{conflict.tableName} · {conflict.keyColumn} = {conflict.rowKey}
                    </p>
                  </div>
                  <span className="text-xs text-muted">
                    <RelativeTime value={conflict.createdAt} />
                  </span>
                </div>
                <p className="mb-3 text-sm text-muted">{conflict.message}</p>
                <ValueTable conflict={conflict} />
                {conflict.status === "OPEN" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" loading={pendingId === conflict.id && resolve.isPending} onClick={() => act(conflict, "POSTGRES")}>
                      <Database aria-hidden className="size-3.5" /> Keep PostgreSQL version
                    </Button>
                    <Button variant="sheets" size="sm" loading={pendingId === conflict.id && resolve.isPending} onClick={() => act(conflict, "SHEETS")}>
                      <FileSpreadsheet aria-hidden className="size-3.5" /> Keep Sheets version
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => act(conflict, "DISMISS")}>
                      <X aria-hidden className="size-3.5" /> Dismiss
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={tab === "OPEN" ? <CircleCheck className="size-5" /> : <GitCompareArrows className="size-5" />}
            title={tab === "OPEN" ? "No conflicts to review" : "No resolved conflicts"}
            description={
              tab === "OPEN"
                ? "When the same row is edited in PostgreSQL and in Google Sheets between syncs, it will appear here instead of being overwritten silently."
                : "Conflicts you resolve, or that a strategy resolved automatically, are listed here."
            }
          />
        </Card>
      )}
    </>
  );
}
