import { History } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { RunSummary } from "@/components/sync/run-summary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RelativeTime } from "@/components/ui/relative-time";
import { SkeletonRows } from "@/components/ui/skeleton";
import { RunStatusBadge } from "@/components/ui/status";
import { useSyncConfigurations, useSyncHistory } from "@/hooks/use-sync";
import { formatDateTime } from "@/lib/format";
import type { SyncRunStatus } from "@/types/api";

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const syncId = params.get("sync") ?? undefined;
  const status = (params.get("status") as SyncRunStatus | null) ?? undefined;
  const syncs = useSyncConfigurations();
  const history = useSyncHistory({ syncId, status });
  const runs = history.data?.pages.flatMap((page) => page.items) ?? [];

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Sync history"
        description="Every synchronization run with the rows it processed, conflicts it found and errors it hit."
        actions={
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="history-sync">
              Sync
            </label>
            <Select id="history-sync" value={syncId ?? ""} onChange={(event) => setParam("sync", event.target.value)} className="w-48">
              <option value="">All syncs</option>
              {syncs.data?.map((sync) => (
                <option key={sync.id} value={sync.id}>
                  {sync.name}
                </option>
              ))}
            </Select>
            <label className="sr-only" htmlFor="history-status">
              Status
            </label>
            <Select id="history-status" value={status ?? ""} onChange={(event) => setParam("status", event.target.value)} className="w-36">
              <option value="">Any status</option>
              <option value="SUCCESS">Success</option>
              <option value="PARTIAL">Partial</option>
              <option value="FAILED">Failed</option>
              <option value="RUNNING">Running</option>
            </Select>
          </div>
        }
      />
      <Card>
        {history.isLoading ? (
          <div className="p-5">
            <SkeletonRows rows={6} />
          </div>
        ) : history.isError ? (
          <div className="p-5">
            <ErrorState error={history.error} onRetry={() => void history.refetch()} />
          </div>
        ) : runs.length ? (
          <>
            <ul className="divide-y divide-border">
              {runs.map((run) => (
                <li key={run.id} className="px-5 py-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/syncs/${run.syncConfigurationId}`} className="text-sm font-medium hover:underline">
                        {run.syncName}
                      </Link>
                      <p className="text-xs text-muted">
                        <RelativeTime value={run.startedAt} /> · {formatDateTime(run.startedAt)}
                      </p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>
                  <RunSummary run={run} />
                </li>
              ))}
            </ul>
            {history.hasNextPage ? (
              <div className="flex justify-center border-t border-border p-4">
                <Button variant="outline" onClick={() => void history.fetchNextPage()} loading={history.isFetchingNextPage} loadingText="Loading…">
                  Load more runs
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={<History className="size-5" />}
            title="No sync history yet"
            description={syncId || status ? "No runs match these filters." : "Once you run a sync, every run is recorded here with its row counts and errors."}
          />
        )}
      </Card>
    </>
  );
}
