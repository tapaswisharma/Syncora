import { CircleAlert, CircleCheck, CircleDashed, CircleX, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { HealthStatus, SyncRunStatus } from "@/types/api";
import { Badge, type Tone } from "./badge";

const health: Record<HealthStatus, { label: string; dot: string; tone: Tone }> = {
  CONNECTED: { label: "Connected", dot: "bg-success-strong", tone: "success" },
  DEGRADED: { label: "Degraded", dot: "bg-secondary-strong", tone: "warning" },
  DISCONNECTED: { label: "Disconnected", dot: "bg-danger", tone: "danger" },
  UNKNOWN: { label: "Not verified", dot: "bg-subtle", tone: "neutral" },
};

/** Health is only ever "Connected" when the server actually verified it. */
export function HealthBadge({ status, className }: { status: HealthStatus; className?: string }) {
  const meta = health[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

const runMeta: Record<SyncRunStatus, { label: string; tone: Tone; Icon: typeof CircleCheck }> = {
  SUCCESS: { label: "Success", tone: "success", Icon: CircleCheck },
  PARTIAL: { label: "Partial", tone: "warning", Icon: CircleAlert },
  FAILED: { label: "Failed", tone: "danger", Icon: CircleX },
  RUNNING: { label: "Running", tone: "primary", Icon: LoaderCircle },
};

export function RunStatusBadge({ status }: { status: SyncRunStatus | null }) {
  if (!status) return <Badge icon={<CircleDashed className="size-3" aria-hidden />}>Never run</Badge>;
  const { label, tone, Icon } = runMeta[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden className={cn("size-3", status === "RUNNING" && "animate-spin")} />}>
      {label}
    </Badge>
  );
}
