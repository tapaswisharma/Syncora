import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";

interface ExplorerSelection {
  connectionId: string | null;
  database: string | null;
  schema: string | null;
  table: string | null;
}

interface UiState {
  theme: ThemePreference;
  sidebarOpen: boolean;
  explorer: ExplorerSelection;
  setTheme: (theme: ThemePreference) => void;
  setSidebarOpen: (open: boolean) => void;
  selectConnection: (connectionId: string | null) => void;
  selectDatabase: (database: string | null) => void;
  selectSchema: (schema: string | null) => void;
  selectTable: (table: string | null) => void;
}

/** Client-only UI state. Server data lives in React Query, never here. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "system",
      sidebarOpen: false,
      explorer: { connectionId: null, database: null, schema: null, table: null },
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      selectConnection: (connectionId) => set({ explorer: { connectionId, database: null, schema: null, table: null } }),
      selectDatabase: (database) => set((state) => ({ explorer: { ...state.explorer, database, schema: null, table: null } })),
      selectSchema: (schema) => set((state) => ({ explorer: { ...state.explorer, schema, table: null } })),
      selectTable: (table) => set((state) => ({ explorer: { ...state.explorer, table } })),
    }),
    {
      name: "dbsynchro-ui",
      partialize: (state) => ({ theme: state.theme, explorer: state.explorer }),
    },
  ),
);

export function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
