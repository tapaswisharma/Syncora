import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const accents = {
  primary: "bg-primary-soft text-primary-strong",
  sheets: "bg-secondary-soft text-secondary-strong",
  success: "bg-success-soft text-success-strong",
  danger: "bg-danger-soft text-danger",
};

export function StatCard({ label, value, hint, icon, accent = "primary" }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; accent?: keyof typeof accents }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", accents[accent])}>{icon}</span>
      </div>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}
