import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { closeDb } from "./db/client.js";
import { disposeAllPools } from "./services/postgres/pool-manager.js";
import { startScheduler } from "./services/sync/scheduler.js";
import { syncRunService } from "./services/sync/sync-run.service.js";
import { logger } from "./utils/logger.js";

const app = createApp();
let stopScheduler: (() => void) | undefined;

const server = app.listen(env.PORT, async () => {
  logger.info(`DBSynchro API listening on ${env.API_BASE_URL} (port ${env.PORT})`);
  logger.info(`Auth mode: ${env.authMode}${env.authMode === "dev" ? " (local development only, no real sign-in)" : ""}`);
  if (!env.databaseConfigured) logger.warn("DATABASE_URL is not set: only /api/health and /api/config will work.");
  if (!env.googleConfigured) logger.warn("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not set: Google Sheets features are disabled.");
  if (env.databaseConfigured) {
    try {
      const interrupted = await syncRunService.failAllRunning();
      if (interrupted) logger.warn(`Marked ${interrupted} interrupted sync run(s) as failed.`);
      if (env.ENABLE_SCHEDULER) stopScheduler = startScheduler();
    } catch (error) {
      logger.error({ err: error }, "Startup tasks failed. Has `npm run db:migrate` been run?");
    }
  }
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopScheduler?.();
  server.close();
  await Promise.allSettled([disposeAllPools(), closeDb()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled promise rejection"));
