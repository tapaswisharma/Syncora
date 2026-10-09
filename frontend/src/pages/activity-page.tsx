import { Activity } from "lucide-react";
import { ActivityList } from "@/components/dashboard/activity-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useActivity } from "@/hooks/use-sync";

export default function ActivityPage() {
  const activity = useActivity();
  const items = activity.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <PageHeader title="Activity" description="A log of everything DBSynchro has done on your behalf." />
      <Card>
        {activity.isLoading ? (
          <div className="p-5">
            <SkeletonRows rows={8} />
          </div>
        ) : activity.isError ? (
          <div className="p-5">
            <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
          </div>
        ) : items.length ? (
          <>
            <div className="px-5">
              <ActivityList items={items} />
            </div>
            {activity.hasNextPage ? (
              <div className="flex justify-center border-t border-border p-4">
                <Button variant="outline" onClick={() => void activity.fetchNextPage()} loading={activity.isFetchingNextPage} loadingText="Loading…">
                  Load older activity
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={<Activity className="size-5" />}
            title="No activity yet"
            description="Connecting a database, connecting Google, creating a sync and running a sync are all recorded here."
          />
        )}
      </Card>
    </>
  );
}
