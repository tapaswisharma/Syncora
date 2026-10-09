import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { syncConfigurations, syncRuns, type SyncConfiguration, type SyncRun, type SyncRunDetails, type SyncRunStatus } from "../../db/schema.js";
import { notFound } from "../../utils/errors.js";

export interface RunOutcome {
  status: Exclude<SyncRunStatus, "RUNNING">;
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeleted: number;
  conflictsCount: number;
  errors: string[];
  errorMessage: string | null;
  details: SyncRunDetails | null;
}

export const syncRunService = {
  async start(config: SyncConfiguration, trigger: "MANUAL" | "SCHEDULED"): Promise<SyncRun> {
    const [run] = await getDb()
      .insert(syncRuns)
      .values({ syncConfigurationId: config.id, userId: config.userId, direction: config.direction, trigger, status: "RUNNING" })
      .returning();
    return run!;
  },

  async finish(run: SyncRun, outcome: RunOutcome): Promise<void> {
    const finishedAt = new Date();
    const db = getDb();
    await db
      .update(syncRuns)
      .set({ ...outcome, errors: outcome.errors.slice(0, 100), errorsCount: outcome.errors.length, finishedAt })
      .where(eq(syncRuns.id, run.id));
    await db
      .update(syncConfigurations)
      .set({
        lastRunStatus: outcome.status,
        // "Last synced" only moves forward when data actually synchronized.
        ...(outcome.status !== "FAILED" ? { lastSyncedAt: finishedAt } : {}),
      })
      .where(eq(syncConfigurations.id, run.syncConfigurationId));
  },

  async findRunning(configId: string): Promise<SyncRun | undefined> {
    const [run] = await getDb()
      .select()
      .from(syncRuns)
      .where(and(eq(syncRuns.syncConfigurationId, configId), eq(syncRuns.status, "RUNNING")))
      .limit(1);
    return run;
  },

  async get(userId: string, runId: string): Promise<SyncRun> {
    const [run] = await getDb().select().from(syncRuns).where(and(eq(syncRuns.id, runId), eq(syncRuns.userId, userId)));
    if (!run) throw notFound("Sync run not found.");
    return run;
  },

  async history(userId: string, options: { syncId?: string; status?: SyncRunStatus; limit: number; offset: number }) {
    const conditions = [eq(syncRuns.userId, userId)];
    if (options.syncId) conditions.push(eq(syncRuns.syncConfigurationId, options.syncId));
    if (options.status) conditions.push(eq(syncRuns.status, options.status));
    const rows = await getDb()
      .select({ run: syncRuns, syncName: syncConfigurations.name, tableName: syncConfigurations.tableName, worksheetTitle: syncConfigurations.worksheetTitle })
      .from(syncRuns)
      .innerJoin(syncConfigurations, eq(syncConfigurations.id, syncRuns.syncConfigurationId))
      .where(and(...conditions))
      .orderBy(desc(syncRuns.startedAt))
      .limit(options.limit + 1)
      .offset(options.offset);
    return {
      items: rows.slice(0, options.limit).map(({ run, ...rest }) => ({ ...run, ...rest })),
      hasMore: rows.length > options.limit,
    };
  },

  /** Runs left RUNNING by a crash/restart are marked failed so they don't block new runs forever. */
  async failStaleRuns(olderThanMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const rows = await getDb()
      .update(syncRuns)
      .set({ status: "FAILED", finishedAt: new Date(), errorMessage: "The sync was interrupted (server restart or timeout)." })
      .where(and(eq(syncRuns.status, "RUNNING"), lt(syncRuns.startedAt, cutoff)))
      .returning({ id: syncRuns.id });
    return rows.length;
  },

  async failAllRunning(): Promise<number> {
    const rows = await getDb()
      .update(syncRuns)
      .set({ status: "FAILED", finishedAt: new Date(), errorMessage: "The sync was interrupted by a server restart." })
      .where(eq(syncRuns.status, "RUNNING"))
      .returning({ id: syncRuns.id });
    return rows.length;
  },
};
