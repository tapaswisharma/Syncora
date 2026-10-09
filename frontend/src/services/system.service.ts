import { api } from "@/lib/api";
import type { CurrentUser, DashboardSummary, PublicConfig } from "@/types/api";

export const systemService = {
  config: () => api<PublicConfig>("/config"),
  me: () => api<{ user: CurrentUser; authMode: string }>("/auth/me"),
  dashboard: () => api<DashboardSummary>("/dashboard"),
};
