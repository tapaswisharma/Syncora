import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { syncService } from "@/services/sync.service";
import type { SyncConfigInput, SyncRunStatus } from "@/types/api";

export function useSyncConfigurations() {
  return useQuery({
    queryKey: queryKeys.syncConfigurations,
    queryFn: syncService.list,
    // Poll while any sync is running so status updates without a manual refresh.
    refetchInterval: (query) => (query.state.data?.some((sync) => sync.runningRunId) ? 2000 : false),
  });
}

export function useSyncConfiguration(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.syncConfiguration(id ?? ""),
    queryFn: () => syncService.get(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.runningRunId ? 2000 : false),
  });
}

function useInvalidateSync() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.syncConfigurations });
    void client.invalidateQueries({ queryKey: ["history"] });
    void client.invalidateQueries({ queryKey: ["conflicts"] });
    void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    void client.invalidateQueries({ queryKey: queryKeys.activityLogs });
  };
}

export function useCreateSync() {
  const invalidate = useInvalidateSync();
  return useMutation({ mutationFn: (input: SyncConfigInput) => syncService.create(input), onSuccess: invalidate });
}

export function useUpdateSync() {
  const invalidate = useInvalidateSync();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SyncConfigInput> }) => syncService.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSync() {
  const invalidate = useInvalidateSync();
  return useMutation({ mutationFn: (id: string) => syncService.remove(id), onSuccess: invalidate });
}

export function useValidateSync() {
  return useMutation({ mutationFn: syncService.validate });
}

export function usePreviewSync() {
  return useMutation({ mutationFn: (id: string) => syncService.preview(id) });
}

export function useRunSync() {
  const invalidate = useInvalidateSync();
  return useMutation({
    mutationFn: ({ id, confirmDeletes }: { id: string; confirmDeletes: boolean }) => syncService.run(id, confirmDeletes),
    onSuccess: invalidate,
  });
}

/** Polls a run until it leaves RUNNING, then refreshes everything that depends on it. */
export function useSyncRun(runId: string | null) {
  const invalidate = useInvalidateSync();
  return useQuery({
    queryKey: queryKeys.syncRun(runId ?? ""),
    queryFn: async () => {
      const run = await syncService.runDetail(runId!);
      if (run.status !== "RUNNING") invalidate();
      return run;
    },
    enabled: Boolean(runId),
    refetchInterval: (query) => (query.state.data?.status === "RUNNING" || !query.state.data ? 1500 : false),
  });
}

export function useSyncHistory(params: { syncId?: string; status?: SyncRunStatus }) {
  return useInfiniteQuery({
    queryKey: queryKeys.syncHistory({ ...params, offset: 0 }),
    queryFn: ({ pageParam }) => syncService.history({ ...params, offset: pageParam, limit: 25 }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * 25 : undefined),
    refetchInterval: (query) => (query.state.data?.pages[0]?.items.some((run) => run.status === "RUNNING") ? 2000 : false),
  });
}

export function useConflicts(params: { status?: "OPEN" | "RESOLVED"; syncId?: string }) {
  return useQuery({ queryKey: queryKeys.conflicts(params), queryFn: () => syncService.conflicts(params) });
}

export function useResolveConflict() {
  const invalidate = useInvalidateSync();
  return useMutation({
    mutationFn: ({ id, choice }: { id: string; choice: "POSTGRES" | "SHEETS" | "DISMISS" }) => syncService.resolveConflict(id, choice),
    onSuccess: invalidate,
  });
}

export function useActivity() {
  return useInfiniteQuery({
    queryKey: queryKeys.activityLogs,
    queryFn: ({ pageParam }) => syncService.activity(pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}
