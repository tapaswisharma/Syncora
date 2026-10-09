import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "sheets";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-[#0f2433] hover:bg-[#a5c4da] border border-[#9fbfd6] shadow-sm",
  sheets: "bg-secondary text-[#4a1822] hover:bg-[#f6c9ce] border border-[#efc1c7] shadow-sm",
  secondary: "bg-surface-muted text-text hover:bg-border border border-border",
  outline: "bg-surface text-text border border-border-strong hover:bg-surface-muted",
  ghost: "text-muted hover:text-text hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90 border border-transparent shadow-sm dark:text-[#2a0b07]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-9 w-9 justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, loadingText, disabled, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg font-medium whitespace-nowrap transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="size-3.5" /> : null}
      {loading && loadingText ? loadingText : children}
    </button>
  );
});
