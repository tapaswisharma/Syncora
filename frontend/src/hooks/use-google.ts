import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { googleService } from "@/services/google.service";

export function useGoogleStatus() {
  return useQuery({ queryKey: queryKeys.googleStatus, queryFn: googleService.status });
}

export function useGoogleHealthCheck() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: googleService.checkHealth,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.googleStatus });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useConnectGoogle() {
  return useMutation({
    mutationFn: async () => {
      const url = await googleService.authUrl();
      window.location.assign(url);
    },
  });
}

export function useDisconnectGoogle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: googleService.disconnect,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["google"] });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useSpreadsheets(search: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.spreadsheets(search),
    queryFn: () => googleService.spreadsheets(search || undefined),
    enabled,
    staleTime: 60_000,
  });
}

export function useSpreadsheet(id: string | null) {
  return useQuery({
    queryKey: queryKeys.spreadsheet(id ?? ""),
    queryFn: () => googleService.spreadsheet(id!),
    enabled: Boolean(id),
  });
}

export function useWorksheetPreview(spreadsheetId: string | null, worksheetId: number | null, pgColumns: string[] = []) {
  return useQuery({
    queryKey: queryKeys.worksheetPreview(spreadsheetId ?? "", worksheetId ?? -1, pgColumns.join(",")),
    queryFn: () => googleService.preview(spreadsheetId!, worksheetId!, { pgColumns }),
    enabled: Boolean(spreadsheetId) && worksheetId !== null,
  });
}
