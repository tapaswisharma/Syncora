import { Activity, ArrowLeftRight, ArrowRight, CircleX, Database, FileSpreadsheet, GitCompareArrows, Plug, Plus, Rows3 } from "lucide-react";
import { Link } from "react-router-dom";
import { ActivityList } from "@/components/dashboard/activity-list";
import { StatCard } from "@/components/dashboard/stat-card";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthBadge, RunStatusBadge } from "@/components/ui/status";
import { useAuth } from "@/hooks/use-auth";
import { useDashboard } from "@/hooks/use-system";
import { formatNumber } from "@/lib/format";

export default function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useDashboard();
  const data = dashboard.data;
  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="An overview of your connections, syncs and recent activity."
        actions={
          <LinkButton to="/syncs/new">
            <Plus aria-hidden className="size-4" /> New sync
          </LinkButton>
        }
      />

      {dashboard.isError ? <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} /> : null}

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {dashboard.isLoading || !data ? (
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-(--radius-card)" />)
        ) : (
          <>
            <StatCard label="Connections" value={data.connections.total} hint={`${data.connections.healthy} verified healthy`} icon={<Plug aria-hidden className="size-4" />} />
            <StatCard
              label="Active syncs"
              value={data.syncs.enabled}
              hint={data.syncs.running ? `${data.syncs.running} running now` : `${data.syncs.total} configured`}
              icon={<ArrowLeftRight aria-hidden className="size-4" />}
              accent="sheets"
            />
            <StatCard
              label="Last sync"
              value={<span className="text-base">{data.lastRun ? <RelativeTime value={data.lastRun.startedAt} /> : "Never"}</span>}
              hint={data.lastRun ? data.lastRun.syncName : "No sync has run yet"}
              icon={<Activity aria-hidden className="size-4" />}
              accent="success"
            />
            <StatCard label="Rows synchronized" value={formatNumber(data.rowsSynchronized)} hint={`across ${formatNumber(data.totalRuns)} runs`} icon={<Rows3 aria-hidden className="size-4" />} accent="success" />
            <StatCard label="Failed syncs" value={data.failedRunsLast30Days} hint="last 30 days" icon={<CircleX aria-hidden className="size-4" />} accent={data.failedRunsLast30Days ? "danger" : "success"} />
            <StatCard label="Open conflicts" value={data.openConflicts} hint={data.openConflicts ? "need review" : "nothing to review"} icon={<GitCompareArrows aria-hidden className="size-4" />} accent="sheets" />
          </>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Connection health"
              description="Last verified status of each data source."
              actions={
                <Link to="/connections" className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline">
                  Manage <ArrowRight aria-hidden className="size-3" />
                </Link>
              }
            />
            <div className="divide-y divide-border">
              {data?.connections.items.map((connection) => (
                <div key={connection.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Database aria-hidden className="size-4 text-primary-strong" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{connection.name}</p>
                    <p className="truncate text-xs text-muted">
                      {connection.lastError ?? `${connection.host}/${connection.database}`}
                    </p>
                  </div>
                  <span className="tabular text-xs text-muted">{connection.lastLatencyMs !== null ? `${connection.lastLatencyMs} ms` : ""}</span>
                  <HealthBadge status={connection.healthStatus} />
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                <FileSpreadsheet aria-hidden className="size-4 text-secondary-strong" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Google Sheets</p>
                  <p className="truncate text-xs text-muted">
                    {data?.google ? data.google.lastError ?? data.google.googleEmail ?? "Connected account" : "No Google account connected"}
                  </p>
                </div>
                {data?.google ? (
                  <HealthBadge status={data.google.healthStatus} />
                ) : (
                  <Link to="/settings" className="text-xs font-medium text-primary-strong hover:underline">
                    Connect
                  </Link>
                )}
              </div>
              {data && data.connections.items.length === 0 ? (
                <EmptyState
                  className="py-8"
                  icon={<Plug className="size-5" />}
                  title="No PostgreSQL connections yet"
                  description="Connect a database to start exploring tables and syncing."
                  action={
                    <Link to="/connections" className="text-sm font-medium text-primary-strong hover:underline">
                      Add a connection
                    </Link>
                  }
                />
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Latest run" description="The most recent synchronization." />
            <div className="px-5 py-4">
              {data?.lastRun ? (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <RunStatusBadge status={data.lastRun.status} />
                  <Link to={`/syncs/${data.lastRun.syncConfigurationId}`} className="font-medium hover:underline">
                    {data.lastRun.syncName}
                  </Link>
                  <span className="text-muted">
                    +{data.lastRun.rowsInserted} · ~{data.lastRun.rowsUpdated} · −{data.lastRun.rowsDeleted}
                    {data.lastRun.conflictsCount ? ` · ${data.lastRun.conflictsCount} conflicts` : ""}
                  </span>
                  <span className="text-muted">
                    <RelativeTime value={data.lastRun.startedAt} />
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted">No syncs have run yet. Create a sync and press “Sync now”.</p>
              )}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Recent activity"
            actions={
              <Link to="/activity" className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline">
                View all <ArrowRight aria-hidden className="size-3" />
              </Link>
            }
          />
          <div className="px-5">
            {dashboard.isLoading ? (
              <div className="space-y-3 py-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : data?.recentActivity.length ? (
              <ActivityList items={data.recentActivity} compact />
            ) : (
              <EmptyState icon={<Activity className="size-5" />} title="No activity yet" description="Actions like connecting databases and running syncs will appear here." />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
