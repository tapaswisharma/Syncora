import { create } from "zustand";
import type { ColumnMapping, ConflictStrategy, DeleteMode, SyncDirection } from "@/types/api";

export const WIZARD_STEPS = [
  "Connection",
  "Table",
  "Google account",
  "Worksheet",
  "Columns",
  "Direction",
  "Conflicts",
  "Review",
] as const;

export interface SyncDraft {
  name: string;
  connectionId: string | null;
  databaseName: string | null;
  schemaName: string | null;
  tableName: string | null;
  keyColumn: string | null;
  timestampColumn: string | null;
  spreadsheetId: string | null;
  spreadsheetName: string | null;
  worksheetId: number | null;
  worksheetTitle: string | null;
  mappings: ColumnMapping[];
  direction: SyncDirection;
  conflictStrategy: ConflictStrategy;
  deleteMode: DeleteMode;
  scheduleMinutes: number | null;
}

const emptyDraft: SyncDraft = {
  name: "",
  connectionId: null,
  databaseName: null,
  schemaName: null,
  tableName: null,
  keyColumn: null,
  timestampColumn: null,
  spreadsheetId: null,
  spreadsheetName: null,
  worksheetId: null,
  worksheetTitle: null,
  mappings: [],
  direction: "BIDIRECTIONAL",
  conflictStrategy: "MANUAL",
  deleteMode: "CONFIRM",
  scheduleMinutes: null,
};

interface WizardState {
  step: number;
  draft: SyncDraft;
  setStep: (step: number) => void;
  next: () => void;
  back: () => void;
  update: (patch: Partial<SyncDraft>) => void;
  reset: () => void;
}

/** In-progress sync configuration. Kept in memory only, so a refresh starts a clean wizard. */
export const useSyncWizardStore = create<WizardState>()((set) => ({
  step: 0,
  draft: emptyDraft,
  setStep: (step) => set({ step }),
  next: () => set((state) => ({ step: Math.min(state.step + 1, WIZARD_STEPS.length - 1) })),
  back: () => set((state) => ({ step: Math.max(state.step - 1, 0) })),
  update: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  reset: () => set({ step: 0, draft: emptyDraft }),
}));
