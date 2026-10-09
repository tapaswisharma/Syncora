import { api } from "@/lib/api";
import type {
  ActivityLog,
  MappingValidation,
  SyncConfigInput,
  SyncConfiguration,
  SyncConflict,
  SyncPreview,
  SyncRun,
  SyncRunStatus,
} from "@/types/api";

export const syncService = {
  list: () => api<{ syncs: SyncConfiguration[] }>("/sync").then((r) => r.syncs),
  get: (id: string) => api<{ sync: SyncConfiguration }>(`/sync/${id}`).then((r) => r.sync),
  create: (input: SyncConfigInput) => api<{ sync: SyncConfiguration }>("/sync", { method: "POST", body: input }).then((r) => r.sync),
  update: (id: string, input: Partial<SyncConfigInput>) =>
    api<{ sync: SyncConfiguration }>(`/sync/${id}`, { method: "PATCH", body: input }).then((r) => r.sync),
  remove: (id: string) => api<void>(`/sync/${id}`, { method: "DELETE" }),
  validate: (input: Omit<SyncConfigInput, "name" | "spreadsheetName" | "worksheetTitle" | "deleteMode" | "enabled" | "scheduleMinutes">) =>
    api<{ validation: MappingValidation }>("/sync/validate", { method: "POST", body: input }).then((r) => r.validation),
  preview: (id: string) => api<{ preview: SyncPreview }>(`/sync/${id}/preview`, { method: "POST" }).then((r) => r.preview),
  run: (id: string, confirmDeletes: boolean) =>
    api<{ run: SyncRun }>(`/sync/${id}/run`, { method: "POST", body: { confirmDeletes } }).then((r) => r.run),
  runDetail: (runId: string) => api<{ run: SyncRun }>(`/sync/runs/${runId}`).then((r) => r.run),
  history: (params: { syncId?: string; status?: SyncRunStatus; limit?: number; offset?: number }) =>
    api<{ items: SyncRun[]; hasMore: boolean }>("/history", { query: { ...params, limit: params.limit ?? 25 } }),
  conflicts: (params: { status?: "OPEN" | "RESOLVED"; syncId?: string }) =>
    api<{ conflicts: SyncConflict[] }>("/conflicts", { query: params }).then((r) => r.conflicts),
  resolveConflict: (id: string, choice: "POSTGRES" | "SHEETS" | "DISMISS") =>
    api<{ status: string }>(`/conflicts/${id}/resolve`, { method: "POST", body: { choice } }),
  activity: (before?: string) => api<{ items: ActivityLog[]; nextCursor: string | null }>("/activity", { query: { before, limit: 30 } }),
};
