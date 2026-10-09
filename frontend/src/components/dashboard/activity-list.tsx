import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { RelativeTime } from "@/components/ui/relative-time";
import { cn } from "@/lib/cn";
import type { ActivityLog } from "@/types/api";

const statusIcon = {
  SUCCESS: { Icon: CircleCheck, className: "text-success-strong", label: "Succeeded" },
  FAILURE: { Icon: CircleAlert, className: "text-danger", label: "Failed" },
  INFO: { Icon: Info, className: "text-primary-strong", label: "Info" },
};

export function actionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((word, index) => (index === 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function ActivityList({ items, compact = false }: { items: ActivityLog[]; compact?: boolean }) {
  return (
    <ol className="divide-y divide-border">
      {items.map((item) => {
        const { Icon, className, label } = statusIcon[item.status];
        return (
          <li key={item.id} className={cn("flex gap-3", compact ? "py-2.5" : "py-3")}>
            <Icon aria-label={label} className={cn("mt-0.5 size-4 shrink-0", className)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text">{item.message}</p>
              <p className="mt-0.5 text-xs text-muted">
                {actionLabel(item.action)}
                {item.entityName ? ` · ${item.entityName}` : ""} · <RelativeTime value={item.createdAt} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
