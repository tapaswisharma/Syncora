import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

/** A router link styled as a primary/outline button, so navigation stays a real anchor. */
export function LinkButton({
  to,
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  const variants = {
    primary: "bg-primary text-[#0f2433] hover:bg-[#a5c4da] border border-[#9fbfd6] shadow-sm",
    outline: "bg-surface text-text border border-border-strong hover:bg-surface-muted",
    ghost: "text-muted hover:text-text hover:bg-surface-muted",
  };
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm",
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
