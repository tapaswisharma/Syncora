import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { systemService } from "@/services/system.service";

export function usePublicConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: systemService.config, staleTime: 5 * 60_000 });
}

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: systemService.dashboard, refetchInterval: 30_000 });
}
