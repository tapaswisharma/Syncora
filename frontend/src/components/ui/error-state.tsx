import { RefreshCw, TriangleAlert } from "lucide-react";
import { errorText } from "@/lib/api";
import { Button } from "./button";

export function ErrorState({ error, onRetry, title = "Something went wrong" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 sm:flex-row sm:items-center">
      <TriangleAlert aria-hidden className="size-5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-danger-ink">{title}</p>
        <p className="text-sm text-danger-ink/90">{errorText(error)}</p>
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden className="size-3.5" /> Retry
        </Button>
      ) : null}
    </div>
  );
}

export function InlineNotice({ tone = "info", children }: { tone?: "info" | "warning" | "success"; children: React.ReactNode }) {
  const styles = {
    info: "border-primary/60 bg-primary-soft text-primary-ink",
    warning: "border-secondary bg-secondary-soft text-secondary-ink",
    success: "border-success bg-success-soft text-success-ink",
  }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}
