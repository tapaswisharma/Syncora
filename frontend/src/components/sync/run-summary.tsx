import { ArrowRight, Database, FileSpreadsheet } from "lucide-react";
import { RunStatusBadge } from "@/components/ui/status";
import { formatDuration } from "@/lib/format";
import type { SyncRun } from "@/types/api";

function Counts({ label, counts, icon }: { label: string; counts: { inserted: number; updated: number; deleted: number }; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {icon}
      <span className="text-muted">{label}</span>
      <span className="tabular font-mono">
        +{counts.inserted} ~{counts.updated} −{counts.deleted}
      </span>
    </div>
  );
}

/** Details of a single run: counts per side, notes, and the errors it recorded. */
export function RunSummary({ run }: { run: SyncRun }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <RunStatusBadge status={run.status} />
        <span className="text-xs text-muted">
          {run.trigger === "SCHEDULED" ? "Scheduled" : "Manual"} · {formatDuration(run.startedAt, run.finishedAt)}
        </span>
        {run.details ? (
          <>
            <Counts label="PostgreSQL" counts={run.details.postgres} icon={<Database aria-hidden className="size-3.5 text-primary-strong" />} />
            <ArrowRight aria-hidden className="size-3 text-subtle" />
            <Counts label="Sheets" counts={run.details.sheets} icon={<FileSpreadsheet aria-hidden className="size-3.5 text-success-strong" />} />
          </>
        ) : null}
        {run.conflictsCount ? <span className="text-xs text-secondary-ink">{run.conflictsCount} conflict(s)</span> : null}
      </div>
      {run.details?.notes?.length ? (
        <ul className="space-y-1">
          {run.details.notes.map((note) => (
            <li key={note} className="rounded-lg border border-secondary bg-secondary-soft px-3 py-1.5 text-xs text-secondary-ink">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
      {run.errors.length ? (
        <details className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-danger-ink">
            {run.errors.length} message{run.errors.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1">
            {run.errors.map((error, index) => (
              <li key={index} className="font-mono text-[11px] text-danger-ink/90">
                {error}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
