import { ArrowLeft, ExternalLink, Eye, Pause, Play, Play as Run, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { RunSummary } from "@/components/sync/run-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, InlineNotice } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RelativeTime } from "@/components/ui/relative-time";
import { Select } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { RunStatusBadge } from "@/components/ui/status";
import { useDeleteSync, usePreviewSync, useRunSync, useSyncConfiguration, useSyncHistory, useSyncRun, useUpdateSync } from "@/hooks/use-sync";
import { errorText } from "@/lib/api";
import { formatDateTime, pluralize } from "@/lib/format";
import { directionLabels, strategyLabels } from "@/lib/mapping";
import type { SyncPreview } from "@/types/api";

function PreviewBody({ preview }: { preview: SyncPreview }) {
  const totals = [
    { label: "Insert into PostgreSQL", value: preview.postgres.inserts },
    { label: "Update in PostgreSQL", value: preview.postgres.updates },
    { label: "Delete from PostgreSQL", value: preview.postgres.deletes },
    { label: "Append to Sheets", value: preview.sheets.inserts },
    { label: "Update in Sheets", value: preview.sheets.updates },
    { label: "Delete from Sheets", value: preview.sheets.deletes },
  ];
  const nothing = totals.every((total) => total.value === 0) && preview.newSheetRows === 0;
  return (
    <div className="space-y-4">
      {nothing ? (
        <InlineNotice tone="success">Both sides already match: this run would change nothing.</InlineNotice>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {totals.map((total) => (
            <div key={total.label} className="rounded-lg border border-border p-3">
              <dt className="text-xs text-muted">{total.label}</dt>
              <dd className="tabular mt-0.5 text-lg font-semibold">{total.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {preview.newSheetRows ? <InlineNotice>{pluralize(preview.newSheetRows, "sheet row")} with no identifier will be inserted and given a generated key.</InlineNotice> : null}
      {preview.unchanged ? <p className="text-xs text-muted">{pluralize(preview.unchanged, "row")} already in step.</p> : null}
      {preview.unmanaged ? <p className="text-xs text-muted">{pluralize(preview.unmanaged, "row")} exist only in the destination and will be left alone.</p> : null}
      {preview.deletesRequireConfirmation ? (
        <InlineNotice tone="warning">This run includes deletions. You will be asked to confirm them before anything is removed.</InlineNotice>
      ) : null}
      {preview.conflicts.length ? (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted">Conflicts</h3>
          <ul className="space-y-1">
            {preview.conflicts.map((conflict) => (
              <li key={conflict.key} className="rounded-lg border border-secondary bg-secondary-soft px-3 py-1.5 text-xs text-secondary-ink">
                {conflict.message} {conflict.resolution ? `Will keep the ${conflict.resolution === "POSTGRES" ? "PostgreSQL" : "Sheets"} version.` : "Needs manual review."}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.issues.length ? (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted">Data issues</h3>
          <ul className="space-y-1">
            {preview.issues.map((issue) => (
              <li key={issue} className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-1.5 text-xs text-danger-ink">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function SyncDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sync = useSyncConfiguration(id);
  const history = useSyncHistory({ syncId: id });
  const preview = usePreviewSync();
  const run = useRunSync();
  const update = useUpdateSync();
  const remove = useDeleteSync();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const liveRun = useSyncRun(activeRunId ?? sync.data?.runningRunId ?? null);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmDeletes, setConfirmDeletes] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (sync.isLoading) return <SkeletonRows rows={6} />;
  if (sync.isError) return <ErrorState error={sync.error} onRetry={() => void sync.refetch()} title="Could not load this sync" />;
  if (!sync.data) return null;
  const config = sync.data;
  const running = Boolean(config.runningRunId) || liveRun.data?.status === "RUNNING";

  const startRun = (withDeletes: boolean) => {
    run.mutate(
      { id: config.id, confirmDeletes: withDeletes },
      {
        onSuccess: (started) => {
          setActiveRunId(started.id);
          setShowPreview(false);
          toast.success("Sync started");
        },
        onError: (error) => toast.error(errorText(error)),
      },
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/syncs" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft aria-hidden className="size-3" /> All syncs
          </Link>
        }
        title={config.name}
        description={
          <>
            Last synced: <RelativeTime value={config.lastSyncedAt} fallback="Never synced" />
            {config.lastSyncedAt ? ` (${formatDateTime(config.lastSyncedAt)})` : ""}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              loading={preview.isPending}
              loadingText="Checking…"
              onClick={() => {
                setShowPreview(true);
                preview.mutate(config.id);
              }}
            >
              <Eye aria-hidden className="size-4" /> Preview changes
            </Button>
            <Button variant="primary" disabled={running} loading={run.isPending} loadingText="Starting…" onClick={() => startRun(false)}>
              <Run aria-hidden className="size-4" /> {running ? "Running…" : "Sync now"}
            </Button>
          </>
        }
      />

      {running ? (
        <Card className="mb-6 flex items-center gap-3 border-primary/60 bg-primary-soft p-4">
          <Spinner className="text-primary-strong" />
          <div>
            <p className="text-sm font-medium text-primary-ink">Synchronizing…</p>
            <p className="text-xs text-primary-ink/80">Reading both sides, applying changes and recording the run.</p>
          </div>
        </Card>
      ) : liveRun.data && liveRun.data.status !== "RUNNING" ? (
        <Card className="mb-6 p-4">
          <CardHeader title="Last run finished" description={<RelativeTime value={liveRun.data.finishedAt ?? liveRun.data.startedAt} />} />
          <div className="pt-4">
            <RunSummary run={liveRun.data} />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Column mapping" description={`${config.mappings?.length ?? 0} columns · row identifier: ${config.keyColumn}`} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-xs">
                  <tr>
                    <th scope="col" className="px-5 py-2 text-left font-medium">
                      PostgreSQL column
                    </th>
                    <th scope="col" className="px-5 py-2 text-left font-medium">
                      Google Sheets column
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {config.mappings?.map((mapping) => (
                    <tr key={mapping.id} className="border-t border-border">
                      <td className="px-5 py-2 font-mono text-xs">
                        {mapping.pgColumn}
                        {mapping.pgColumn === config.keyColumn ? (
                          <Badge tone="primary" className="ml-2">
                            key
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-5 py-2 text-xs">{mapping.sheetColumn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Run history"
              description="Every run, including the rows it changed and any errors."
              actions={
                <Link to={`/history?sync=${config.id}`} className="text-xs font-medium text-primary-strong hover:underline">
                  Open history
                </Link>
              }
            />
            {history.isLoading ? (
              <div className="p-5">
                <SkeletonRows rows={3} />
              </div>
            ) : history.data?.pages[0]?.items.length ? (
              <ul className="divide-y divide-border">
                {history.data.pages.flatMap((page) => page.items).slice(0, 10).map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted">
                        <RelativeTime value={item.startedAt} /> · {formatDateTime(item.startedAt)}
                      </span>
                      <RunStatusBadge status={item.status} />
                    </div>
                    <RunSummary run={item} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Run className="size-5" />} title="No sync history yet" description="Press “Sync now” to run this sync for the first time." />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Configuration" />
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div>
                <dt className="text-xs text-muted">PostgreSQL</dt>
                <dd className="font-mono text-xs">
                  {config.schemaName}.{config.tableName}
                  {config.databaseName ? ` (${config.databaseName})` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Google Sheets</dt>
                <dd className="text-xs">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit#gid=${config.worksheetId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {config.spreadsheetName} / {config.worksheetTitle} <ExternalLink aria-hidden className="size-3" />
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Direction</dt>
                <dd className="text-xs">{directionLabels[config.direction].title}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Conflicts</dt>
                <dd className="text-xs">{strategyLabels[config.conflictStrategy].title}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Deletions</dt>
                <dd className="text-xs">{config.deleteMode === "NEVER" ? "Never delete rows" : "Propagate after confirmation"}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Settings" />
            <div className="space-y-4 px-5 py-4">
              <label className="block text-xs font-medium">
                Schedule
                <Select
                  value={config.scheduleMinutes ?? ""}
                  className="mt-1.5"
                  onChange={(event) =>
                    update.mutate(
                      { id: config.id, input: { scheduleMinutes: event.target.value ? Number(event.target.value) : null } },
                      { onSuccess: () => toast.success("Schedule updated"), onError: (error) => toast.error(errorText(error)) },
                    )
                  }
                >
                  <option value="">Manual only</option>
                  <option value="5">Every 5 minutes</option>
                  <option value="15">Every 15 minutes</option>
                  <option value="60">Hourly</option>
                  <option value="1440">Daily</option>
                </Select>
              </label>
              <Button
                variant="outline"
                className="w-full justify-center"
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: config.id, input: { enabled: !config.enabled } },
                    {
                      onSuccess: () => toast.success(config.enabled ? "Sync paused" : "Sync enabled"),
                      onError: (error) => toast.error(errorText(error)),
                    },
                  )
                }
              >
                {config.enabled ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
                {config.enabled ? "Pause this sync" : "Enable this sync"}
              </Button>
              <Button variant="ghost" className="w-full justify-center text-danger hover:text-danger" onClick={() => setConfirmRemove(true)}>
                <Trash2 aria-hidden className="size-4" /> Delete sync
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title="Preview changes"
        description="A dry run: both sides are read, but nothing is written."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close
            </Button>
            {preview.data && preview.data.deletesRequireConfirmation ? (
              <Button variant="danger" loading={run.isPending} onClick={() => setConfirmDeletes(true)}>
                Run including deletions
              </Button>
            ) : null}
            <Button variant="primary" disabled={running} loading={run.isPending} onClick={() => startRun(false)}>
              Run sync
            </Button>
          </>
        }
      >
        {preview.isPending ? (
          <Spinner label="Reading PostgreSQL and Google Sheets…" />
        ) : preview.isError ? (
          <ErrorState error={preview.error} title="Could not preview this sync" />
        ) : preview.data ? (
          <PreviewBody preview={preview.data} />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirmDeletes}
        onClose={() => setConfirmDeletes(false)}
        destructive
        title="Apply deletions?"
        description={`This run will delete ${pluralize(
          (preview.data?.postgres.deletes ?? 0) + (preview.data?.sheets.deletes ?? 0),
          "row",
        )} that were removed on the other side. This cannot be undone.`}
        confirmLabel="Run and delete rows"
        loading={run.isPending}
        onConfirm={() => {
          setConfirmDeletes(false);
          startRun(true);
        }}
      />

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        destructive
        title={`Delete "${config.name}"?`}
        description="This removes the sync configuration, its mapping and its history. Your table and spreadsheet are not touched."
        confirmLabel="Delete sync"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(config.id, {
            onSuccess: () => {
              toast.success(`Deleted "${config.name}"`);
              navigate("/syncs");
            },
            onError: (error) => toast.error(errorText(error)),
          })
        }
      />
    </>
  );
}
