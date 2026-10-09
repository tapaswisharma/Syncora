import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { connections, googleIntegrations, syncConfigurations, syncConflicts, syncRuns } from "../db/schema.js";
import { listActivity } from "./activity.service.js";

export const dashboardService = {
  async summary(userId: string) {
    const db = getDb();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [connectionRows, syncCounts, runningCount, lastRun, totals, failed, openConflicts, google, activity] = await Promise.all([
      db
        .select({
          id: connections.id,
          name: connections.name,
          host: connections.host,
          database: connections.database,
          healthStatus: connections.healthStatus,
          lastLatencyMs: connections.lastLatencyMs,
          lastCheckedAt: connections.lastCheckedAt,
          lastError: connections.lastError,
        })
        .from(connections)
        .where(eq(connections.userId, userId))
        .orderBy(connections.name),
      db
        .select({ total: count(), enabled: sql<number>`count(*) filter (where ${syncConfigurations.enabled})`.mapWith(Number) })
        .from(syncConfigurations)
        .where(eq(syncConfigurations.userId, userId)),
      db.select({ value: count() }).from(syncRuns).where(and(eq(syncRuns.userId, userId), eq(syncRuns.status, "RUNNING"))),
      db
        .select({ run: syncRuns, syncName: syncConfigurations.name })
        .from(syncRuns)
        .innerJoin(syncConfigurations, eq(syncConfigurations.id, syncRuns.syncConfigurationId))
        .where(eq(syncRuns.userId, userId))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1),
      db
        .select({
          inserted: sum(syncRuns.rowsInserted).mapWith(Number),
          updated: sum(syncRuns.rowsUpdated).mapWith(Number),
          deleted: sum(syncRuns.rowsDeleted).mapWith(Number),
          runs: count(),
        })
        .from(syncRuns)
        .where(eq(syncRuns.userId, userId)),
      db
        .select({ value: count() })
        .from(syncRuns)
        .where(and(eq(syncRuns.userId, userId), eq(syncRuns.status, "FAILED"), gte(syncRuns.startedAt, since))),
      db.select({ value: count() }).from(syncConflicts).where(and(eq(syncConflicts.userId, userId), eq(syncConflicts.status, "OPEN"))),
      db
        .select({
          googleEmail: googleIntegrations.googleEmail,
          healthStatus: googleIntegrations.healthStatus,
          lastCheckedAt: googleIntegrations.lastCheckedAt,
          lastError: googleIntegrations.lastError,
        })
        .from(googleIntegrations)
        .where(eq(googleIntegrations.userId, userId)),
      listActivity(userId, { limit: 8 }),
    ]);

    const t = totals[0];
    return {
      connections: {
        total: connectionRows.length,
        healthy: connectionRows.filter((c) => c.healthStatus === "CONNECTED").length,
        items: connectionRows,
      },
      syncs: { total: syncCounts[0]?.total ?? 0, enabled: syncCounts[0]?.enabled ?? 0, running: runningCount[0]?.value ?? 0 },
      lastRun: lastRun[0] ? { ...lastRun[0].run, syncName: lastRun[0].syncName } : null,
      rowsSynchronized: (t?.inserted ?? 0) + (t?.updated ?? 0) + (t?.deleted ?? 0),
      totalRuns: t?.runs ?? 0,
      failedRunsLast30Days: failed[0]?.value ?? 0,
      openConflicts: openConflicts[0]?.value ?? 0,
      google: google[0] ?? null,
      recentActivity: activity.items,
    };
  },
};
