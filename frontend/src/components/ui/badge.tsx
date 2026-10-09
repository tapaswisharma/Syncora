import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "primary" | "sheets" | "success" | "danger" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted border-border",
  primary: "bg-primary-soft text-primary-ink border-primary/60",
  sheets: "bg-secondary-soft text-secondary-ink border-secondary",
  warning: "bg-secondary-soft text-secondary-ink border-secondary",
  success: "bg-success-soft text-success-ink border-success",
  danger: "bg-danger-soft text-danger-ink border-danger/30",
};

export function Badge({ tone = "neutral", children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
