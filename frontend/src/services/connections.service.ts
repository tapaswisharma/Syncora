import { api } from "@/lib/api";
import type { Connection, ConnectionInput, ConnectionTestResult } from "@/types/api";

export const connectionsService = {
  list: () => api<{ connections: Connection[] }>("/connections").then((r) => r.connections),
  get: (id: string) => api<{ connection: Connection }>(`/connections/${id}`).then((r) => r.connection),
  create: (input: ConnectionInput) => api<{ connection: Connection }>("/connections", { method: "POST", body: input }).then((r) => r.connection),
  update: (id: string, input: Partial<ConnectionInput>) =>
    api<{ connection: Connection }>(`/connections/${id}`, { method: "PATCH", body: input }).then((r) => r.connection),
  remove: (id: string) => api<void>(`/connections/${id}`, { method: "DELETE" }),
  test: (id: string) => api<{ result: ConnectionTestResult }>(`/connections/${id}/test`, { method: "POST" }).then((r) => r.result),
  testUnsaved: (input: Omit<ConnectionInput, "name"> & { connectionId?: string }) =>
    api<{ result: ConnectionTestResult }>("/connections/test", { method: "POST", body: input }).then((r) => r.result),
};
