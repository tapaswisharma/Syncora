import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { activityLogs } from "../db/schema.js";
import { logger } from "../utils/logger.js";

export type ActivityAction =
  | "CONNECTION_CREATED"
  | "CONNECTION_UPDATED"
  | "CONNECTION_DELETED"
  | "CONNECTION_TESTED"
  | "GOOGLE_CONNECTED"
  | "GOOGLE_DISCONNECTED"
  | "GOOGLE_CHECKED"
  | "SYNC_CREATED"
  | "SYNC_UPDATED"
  | "SYNC_DELETED"
  | "MAPPING_UPDATED"
  | "SYNC_STARTED"
  | "SYNC_COMPLETED"
  | "SYNC_FAILED"
  | "CONFLICT_RESOLVED"
  | "ROWS_DELETED";

export interface ActivityInput {
  action: ActivityAction;
  status?: "SUCCESS" | "FAILURE" | "INFO";
  entityType?: "connection" | "google" | "sync" | "conflict" | "table";
  entityId?: string;
  entityName?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Records an activity entry. Logging must never break the action being logged. */
export async function logActivity(userId: string, input: ActivityInput): Promise<void> {
  try {
    await getDb().insert(activityLogs).values({ userId, status: input.status ?? "SUCCESS", ...input });
  } catch (error) {
    logger.warn({ err: error, action: input.action }, "Failed to write activity log");
  }
}

export async function listActivity(userId: string, options: { limit: number; before?: Date }) {
  const conditions = [eq(activityLogs.userId, userId)];
  if (options.before) conditions.push(lt(activityLogs.createdAt, options.before));
  const rows = await getDb()
    .select()
    .from(activityLogs)
    .where(and(...conditions))
    .orderBy(desc(activityLogs.createdAt))
    .limit(options.limit + 1);
  const hasMore = rows.length > options.limit;
  const items = rows.slice(0, options.limit);
  return { items, nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() : null };
}
