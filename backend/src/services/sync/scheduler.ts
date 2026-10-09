import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { syncConfigurations } from "../../db/schema.js";
import { logger } from "../../utils/logger.js";
import { syncRunService } from "./sync-run.service.js";
import { syncService } from "./sync.service.js";

const TICK_MS = 60_000;

/**
 * Runs enabled syncs that have a schedule. Scheduled runs never apply deletions (those need a
 * person to confirm). Run a single backend instance with ENABLE_SCHEDULER=true.
 */
export function startScheduler(): () => void {
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await syncRunService.failStaleRuns();
      const due = await getDb()
        .select()
        .from(syncConfigurations)
        .where(and(eq(syncConfigurations.enabled, true), isNotNull(syncConfigurations.scheduleMinutes)));
      const now = Date.now();
      for (const config of due) {
        const last = config.lastSyncedAt?.getTime() ?? 0;
        if (now - last < (config.scheduleMinutes ?? 0) * 60_000 || syncService.isRunning(config.id)) continue;
        try {
          await syncService.startRun(config.userId, config.id, { confirmDeletes: false, trigger: "SCHEDULED" });
        } catch (error) {
          logger.warn({ err: error, syncId: config.id }, "Scheduled sync could not start");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Scheduler tick failed");
    } finally {
      ticking = false;
    }
  };
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
