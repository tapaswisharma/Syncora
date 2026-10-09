import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { closeDb, getDb } from "./client.js";
import { logger } from "../utils/logger.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

try {
  await migrate(getDb(), { migrationsFolder });
  logger.info("Migrations applied");
} catch (error) {
  logger.error({ err: error }, "Migration failed");
  process.exitCode = 1;
} finally {
  await closeDb();
}
