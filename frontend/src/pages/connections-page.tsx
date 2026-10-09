import { Database, Pencil, Plug, Plus, RefreshCw, Table2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ConnectionForm } from "@/components/connections/connection-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthBadge } from "@/components/ui/status";
import { useConnections, useCreateConnection, useDeleteConnection, useTestConnection, useUpdateConnection } from "@/hooks/use-connections";
import { errorText } from "@/lib/api";
import { useUiStore } from "@/stores/ui-store";
import type { Connection } from "@/types/api";

function ConnectionCard({ connection, onEdit, onDelete }: { connection: Connection; onEdit: () => void; onDelete: () => void }) {
  const test = useTestConnection();
  const selectConnection = useUiStore((state) => state.selectConnection);
  const navigate = useNavigate();
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-strong">
            <Database aria-hidden className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{connection.name}</h3>
            <p className="truncate font-mono text-xs text-muted">
              {connection.username}@{connection.host}:{connection.port}/{connection.database}
            </p>
          </div>
        </div>
        <HealthBadge status={connection.healthStatus} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-muted">Latency</dt>
          <dd className="tabular mt-0.5 font-medium">{connection.lastLatencyMs !== null ? `${connection.lastLatencyMs} ms` : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">SSL</dt>
          <dd className="mt-0.5 font-medium">{connection.sslMode}</dd>
        </div>
        <div>
          <dt className="text-muted">Checked</dt>
          <dd className="mt-0.5 font-medium">
            <RelativeTime value={connection.lastCheckedAt} fallback="Not yet" />
          </dd>
        </div>
      </dl>
      {connection.lastError ? (
        <p className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger-ink">{connection.lastError}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            selectConnection(connection.id);
            navigate("/databases");
          }}
        >
          <Table2 aria-hidden className="size-3.5" /> Browse
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={test.isPending}
          loadingText="Testing…"
          onClick={() =>
            test.mutate(connection.id, {
              onSuccess: (result) =>
                result.ok ? toast.success(`${connection.name} is reachable (${result.latencyMs} ms)`) : toast.error(result.error ?? "Connection failed"),
              onError: (error) => toast.error(errorText(error)),
            })
          }
        >
          <RefreshCw aria-hidden className="size-3.5" /> Test
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${connection.name}`}>
          <Pencil aria-hidden className="size-3.5" /> Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${connection.name}`} className="text-danger hover:text-danger">
          <Trash2 aria-hidden className="size-3.5" /> Delete
        </Button>
      </div>
    </Card>
  );
}

export default function ConnectionsPage() {
  const connections = useConnections();
  const create = useCreateConnection();
  const update = useUpdateConnection();
  const remove = useDeleteConnection();
  const [editing, setEditing] = useState<Connection | "new" | null>(null);
  const [deleting, setDeleting] = useState<Connection | null>(null);

  return (
    <>
      <PageHeader
        title="Connections"
        description="PostgreSQL databases DBSynchro can read and write. Health is only shown as connected after a real test succeeds."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus aria-hidden className="size-4" /> Add connection
          </Button>
        }
      />
      {connections.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-52 rounded-(--radius-card)" />
          ))}
        </div>
      ) : connections.isError ? (
        <ErrorState error={connections.error} onRetry={() => void connections.refetch()} />
      ) : connections.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connections.data.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} onEdit={() => setEditing(connection)} onDelete={() => setDeleting(connection)} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Plug className="size-5" />}
            title="No PostgreSQL connections yet"
            description="Add a connection to browse tables and set up syncs. Supabase, Neon, RDS and self-hosted PostgreSQL all work."
            action={
              <Button variant="primary" onClick={() => setEditing("new")}>
                <Plus aria-hidden className="size-4" /> Add your first connection
              </Button>
            }
          />
        </Card>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add PostgreSQL connection" : "Edit connection"}
        description="DBSynchro connects from its server, so the database must accept connections from the API host."
      >
        {editing !== null ? (
          <ConnectionForm
            connection={editing === "new" ? undefined : editing}
            submitting={create.isPending || update.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(values) => {
              const done = (connection: Connection) => {
                setEditing(null);
                if (connection.healthStatus === "DISCONNECTED") toast.warning(`Saved "${connection.name}", but the connection test failed: ${connection.lastError}`);
                else toast.success(`Saved "${connection.name}"`);
              };
              const onError = (error: unknown) => toast.error(errorText(error));
              if (editing === "new") create.mutate(values, { onSuccess: done, onError });
              else update.mutate({ id: editing.id, input: values.password ? values : { ...values, password: undefined } }, { onSuccess: done, onError });
            }}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        destructive
        title={`Delete "${deleting?.name}"?`}
        description="This removes the saved connection and every sync configuration that uses it. Your database and spreadsheets are not touched."
        confirmLabel="Delete connection"
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(`Deleted "${deleting.name}"`);
              setDeleting(null);
            },
            onError: (error) => toast.error(errorText(error)),
          })
        }
      />
    </>
  );
}
