import { api } from "@/lib/api";
import type { GoogleHealth, GoogleStatus, Spreadsheet, SpreadsheetDetail, WorksheetPreview } from "@/types/api";

export const googleService = {
  status: () => api<GoogleStatus>("/google/status"),
  checkHealth: () => api<GoogleHealth>("/google/health", { method: "POST" }),
  authUrl: () => api<{ url: string }>("/google/auth-url").then((r) => r.url),
  disconnect: () => api<void>("/google", { method: "DELETE" }),
  spreadsheets: (search?: string, pageToken?: string) =>
    api<{ spreadsheets: Spreadsheet[]; nextPageToken: string | null }>("/google/spreadsheets", { query: { search, pageToken } }),
  spreadsheet: (id: string) => api<{ spreadsheet: SpreadsheetDetail }>(`/google/spreadsheets/${id}`).then((r) => r.spreadsheet),
  preview: (spreadsheetId: string, worksheetId: number, options: { limit?: number; pgColumns?: string[] } = {}) =>
    api<WorksheetPreview>(`/google/spreadsheets/${spreadsheetId}/sheets/${worksheetId}/preview`, {
      query: { limit: options.limit ?? 20, pgColumns: options.pgColumns?.join(",") },
    }),
};
