import { ArrowLeftRight, Plus } from "lucide-react";
import { SyncCard } from "@/components/sync/sync-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useSyncConfigurations } from "@/hooks/use-sync";

export default function SyncsPage() {
  const syncs = useSyncConfigurations();
  return (
    <>
      <PageHeader
        title="Syncs"
        description="Each sync pairs one PostgreSQL table with one Google Sheets worksheet."
        actions={
          <LinkButton to="/syncs/new">
            <Plus aria-hidden className="size-4" /> New sync
          </LinkButton>
        }
      />
      {syncs.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-(--radius-card)" />
          ))}
        </div>
      ) : syncs.isError ? (
        <ErrorState error={syncs.error} onRetry={() => void syncs.refetch()} />
      ) : syncs.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {syncs.data.map((sync) => (
            <SyncCard key={sync.id} sync={sync} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<ArrowLeftRight className="size-5" />}
            title="No sync configurations yet"
            description="Create a sync to keep a PostgreSQL table and a Google Sheets worksheet in step. The wizard walks you through connection, table, worksheet, column mapping and conflict handling."
            action={
              <LinkButton to="/syncs/new">
                <Plus aria-hidden className="size-4" /> Create your first sync
              </LinkButton>
            }
          />
        </Card>
      )}
    </>
  );
}
