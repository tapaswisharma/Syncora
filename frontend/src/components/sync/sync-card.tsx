import { ArrowLeftRight, ArrowRight, Clock, Database, FileSpreadsheet, Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { RunStatusBadge } from "@/components/ui/status";
import { directionLabels } from "@/lib/mapping";
import type { SyncConfiguration } from "@/types/api";

const directionIcon = {
  POSTGRES_TO_SHEETS: ArrowRight,
  SHEETS_TO_POSTGRES: ArrowRight,
  BIDIRECTIONAL: ArrowLeftRight,
};

export function SyncCard({ sync }: { sync: SyncConfiguration }) {
  const DirectionIcon = directionIcon[sync.direction];
  const reversed = sync.direction === "SHEETS_TO_POSTGRES";
  return (
    <Card className="p-5 transition-shadow hover:shadow-(--shadow-pop)">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/syncs/${sync.id}`} className="block truncate text-sm font-semibold hover:underline">
            {sync.name}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {reversed ? <FileSpreadsheet aria-hidden className="size-3.5 text-success-strong" /> : <Database aria-hidden className="size-3.5 text-primary-strong" />}
            <span className="truncate font-mono">{reversed ? sync.worksheetTitle : `${sync.schemaName}.${sync.tableName}`}</span>
            <DirectionIcon aria-hidden className="size-3.5 shrink-0 text-secondary-strong" />
            {reversed ? <Database aria-hidden className="size-3.5 text-primary-strong" /> : <FileSpreadsheet aria-hidden className="size-3.5 text-success-strong" />}
            <span className="truncate font-mono">{reversed ? `${sync.schemaName}.${sync.tableName}` : sync.worksheetTitle}</span>
          </p>
        </div>
        <RunStatusBadge status={sync.runningRunId ? "RUNNING" : sync.lastRunStatus} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="primary">{directionLabels[sync.direction].title}</Badge>
        {sync.scheduleMinutes ? (
          <Badge icon={<Clock aria-hidden className="size-3" />}>Every {sync.scheduleMinutes} min</Badge>
        ) : null}
        <Badge tone={sync.enabled ? "success" : "neutral"} icon={sync.enabled ? <Play aria-hidden className="size-3" /> : <Pause aria-hidden className="size-3" />}>
          {sync.enabled ? "Enabled" : "Paused"}
        </Badge>
        {sync.mappingCount ? <Badge>{sync.mappingCount} columns</Badge> : null}
      </div>

      <p className="mt-4 text-xs text-muted">
        Last synced: <RelativeTime value={sync.lastSyncedAt} fallback="Never synced" />
      </p>
    </Card>
  );
}
