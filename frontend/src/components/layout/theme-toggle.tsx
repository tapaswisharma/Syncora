import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUiStore, type ThemePreference } from "@/stores/ui-store";

const options: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle({ showLabels = false }: { showLabels?: boolean }) {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  return (
    <div role="radiogroup" aria-label="Color theme" className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
            theme === value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          <Icon aria-hidden className="size-3.5" />
          <span className={showLabels ? "" : "sr-only"}>{label}</span>
        </button>
      ))}
    </div>
  );
}
