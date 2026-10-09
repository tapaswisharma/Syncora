import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { connectionsService } from "@/services/connections.service";
import type { ConnectionInput } from "@/types/api";

export function useConnections() {
  return useQuery({ queryKey: queryKeys.connections, queryFn: connectionsService.list });
}

function useInvalidateConnections() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.connections });
    void client.invalidateQueries({ queryKey: queryKeys.dashboard });
    void client.invalidateQueries({ queryKey: queryKeys.activityLogs });
  };
}

export function useCreateConnection() {
  const invalidate = useInvalidateConnections();
  return useMutation({ mutationFn: (input: ConnectionInput) => connectionsService.create(input), onSuccess: invalidate });
}

export function useUpdateConnection() {
  const invalidate = useInvalidateConnections();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ConnectionInput> }) => connectionsService.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteConnection() {
  const invalidate = useInvalidateConnections();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => connectionsService.remove(id),
    onSuccess: () => {
      invalidate();
      void client.invalidateQueries({ queryKey: queryKeys.syncConfigurations });
    },
  });
}

export function useTestConnection() {
  const invalidate = useInvalidateConnections();
  return useMutation({ mutationFn: (id: string) => connectionsService.test(id), onSettled: invalidate });
}

export function useTestUnsavedConnection() {
  return useMutation({ mutationFn: connectionsService.testUnsaved });
}
