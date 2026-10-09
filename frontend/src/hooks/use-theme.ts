import { useEffect } from "react";
import { resolveTheme, useUiStore } from "@/stores/ui-store";

/** Applies the theme class to <html> and follows the OS setting when the preference is "system". */
export function useThemeEffect() {
  const theme = useUiStore((state) => state.theme);
  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
    apply();
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}
