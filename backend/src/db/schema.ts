import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const healthStatusEnum = pgEnum("health_status", ["UNKNOWN", "CONNECTED", "DEGRADED", "DISCONNECTED"]);
export const sslModeEnum = pgEnum("ssl_mode", ["disable", "require", "verify-full"]);
export const syncDirectionEnum = pgEnum("sync_direction", ["POSTGRES_TO_SHEETS", "SHEETS_TO_POSTGRES", "BIDIRECTIONAL"]);
export const conflictStrategyEnum = pgEnum("conflict_strategy", [
  "LAST_WRITE_WINS",
  "POSTGRES_WINS",
  "GOOGLE_SHEETS_WINS",
  "MANUAL",
]);
export const deleteModeEnum = pgEnum("delete_mode", ["CONFIRM", "NEVER"]);
export const syncRunStatusEnum = pgEnum("sync_run_status", ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"]);
export const syncTriggerEnum = pgEnum("sync_trigger", ["MANUAL", "SCHEDULED"]);
export const conflictTypeEnum = pgEnum("conflict_type", ["UPDATE_UPDATE", "UPDATE_DELETE", "DELETE_UPDATE", "INSERT_INSERT"]);
export const conflictStatusEnum = pgEnum("conflict_status", ["OPEN", "RESOLVED_AUTO", "RESOLVED_MANUAL", "DISMISSED"]);
export const conflictSideEnum = pgEnum("conflict_side", ["POSTGRES", "SHEETS"]);
export const activityStatusEnum = pgEnum("activity_status", ["SUCCESS", "FAILURE", "INFO"]);

/** Mirrors the Supabase auth user. `id` is the Supabase user id (JWT `sub`). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ...timestamps,
});

/** A user's PostgreSQL connection. The password is AES-256-GCM encrypted and never returned by the API. */
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull().default(5432),
    database: text("database").notNull(),
    username: text("username").notNull(),
    passwordEncrypted: text("password_encrypted").notNull(),
    sslMode: sslModeEnum("ssl_mode").notNull().default("require"),
    healthStatus: healthStatusEnum("health_status").notNull().default("UNKNOWN"),
    lastLatencyMs: integer("last_latency_ms"),
    lastError: text("last_error"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    serverVersion: text("server_version"),
    ...timestamps,
  },
  (table) => [
    index("connections_user_idx").on(table.userId),
    uniqueIndex("connections_user_name_uniq").on(table.userId, table.name),
  ],
);

/** One Google account per user, connected through the backend OAuth flow (offline access). */
export const googleIntegrations = pgTable(
  "google_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    googleEmail: text("google_email"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    healthStatus: healthStatusEnum("health_status").notNull().default("UNKNOWN"),
    lastError: text("last_error"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("google_integrations_user_uniq").on(table.userId)],
);

export const syncConfigurations = pgTable(
  "sync_configurations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Database on the connection's server; null means the connection's default database. */
    databaseName: text("database_name"),
    schemaName: text("schema_name").notNull(),
    tableName: text("table_name").notNull(),
    /** PostgreSQL column that identifies a row on both sides (usually the primary key). */
    keyColumn: text("key_column").notNull(),
    /** Optional PostgreSQL timestamp column used by LAST_WRITE_WINS. */
    timestampColumn: text("timestamp_column"),
    spreadsheetId: text("spreadsheet_id").notNull(),
    spreadsheetName: text("spreadsheet_name").notNull(),
    worksheetId: integer("worksheet_id").notNull(),
    worksheetTitle: text("worksheet_title").notNull(),
    direction: syncDirectionEnum("direction").notNull(),
    conflictStrategy: conflictStrategyEnum("conflict_strategy").notNull().default("MANUAL"),
    deleteMode: deleteModeEnum("delete_mode").notNull().default("CONFIRM"),
    scheduleMinutes: integer("schedule_minutes"),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastRunStatus: syncRunStatusEnum("last_run_status"),
    ...timestamps,
  },
  (table) => [
    index("sync_configurations_user_idx").on(table.userId),
    index("sync_configurations_connection_idx").on(table.connectionId),
  ],
);

export const syncMappings = pgTable(
  "sync_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syncConfigurationId: uuid("sync_configuration_id")
      .notNull()
      .references(() => syncConfigurations.id, { onDelete: "cascade" }),
    pgColumn: text("pg_column").notNull(),
    sheetColumn: text("sheet_column").notNull(),
    position: integer("position").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sync_mappings_pg_column_uniq").on(table.syncConfigurationId, table.pgColumn),
    uniqueIndex("sync_mappings_sheet_column_uniq").on(table.syncConfigurationId, table.sheetColumn),
  ],
);

export type SideCounts = { inserted: number; updated: number; deleted: number };
export type SyncRunDetails = {
  postgres: SideCounts;
  sheets: SideCounts;
  skippedDeletes?: number;
  notes?: string[];
};

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syncConfigurationId: uuid("sync_configuration_id")
      .notNull()
      .references(() => syncConfigurations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    direction: syncDirectionEnum("direction").notNull(),
    trigger: syncTriggerEnum("trigger").notNull().default("MANUAL"),
    status: syncRunStatusEnum("status").notNull().default("RUNNING"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    rowsProcessed: integer("rows_processed").notNull().default(0),
    rowsInserted: integer("rows_inserted").notNull().default(0),
    rowsUpdated: integer("rows_updated").notNull().default(0),
    rowsDeleted: integer("rows_deleted").notNull().default(0),
    conflictsCount: integer("conflicts_count").notNull().default(0),
    errorsCount: integer("errors_count").notNull().default(0),
    errorMessage: text("error_message"),
    errors: jsonb("errors").$type<string[]>().notNull().default([]),
    details: jsonb("details").$type<SyncRunDetails>(),
    ...timestamps,
  },
  (table) => [
    index("sync_runs_config_started_idx").on(table.syncConfigurationId, table.startedAt.desc()),
    index("sync_runs_user_started_idx").on(table.userId, table.startedAt.desc()),
    index("sync_runs_status_idx").on(table.status),
  ],
);

/**
 * Last agreed state of each synchronized row (a hash of its mapped values).
 * This baseline is what lets the engine tell "changed in PostgreSQL" from "changed in Sheets"
 * and detect conflicts and deletions.
 */
export const syncRowStates = pgTable(
  "sync_row_states",
  {
    syncConfigurationId: uuid("sync_configuration_id")
      .notNull()
      .references(() => syncConfigurations.id, { onDelete: "cascade" }),
    rowKey: text("row_key").notNull(),
    rowHash: text("row_hash").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.syncConfigurationId, table.rowKey] })],
);

export const syncConflicts = pgTable(
  "sync_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    syncConfigurationId: uuid("sync_configuration_id")
      .notNull()
      .references(() => syncConfigurations.id, { onDelete: "cascade" }),
    syncRunId: uuid("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
    rowKey: text("row_key").notNull(),
    type: conflictTypeEnum("type").notNull(),
    strategy: conflictStrategyEnum("strategy").notNull(),
    status: conflictStatusEnum("status").notNull().default("OPEN"),
    resolution: conflictSideEnum("resolution"),
    postgresValues: jsonb("postgres_values").$type<Record<string, string> | null>(),
    sheetValues: jsonb("sheet_values").$type<Record<string, string> | null>(),
    message: text("message").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("sync_conflicts_user_status_idx").on(table.userId, table.status),
    index("sync_conflicts_config_idx").on(table.syncConfigurationId, table.createdAt.desc()),
  ],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    status: activityStatusEnum("status").notNull().default("SUCCESS"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    entityName: text("entity_name"),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("activity_logs_user_created_idx").on(table.userId, table.createdAt.desc())],
);

export const usersRelations = relations(users, ({ many, one }) => ({
  connections: many(connections),
  syncConfigurations: many(syncConfigurations),
  googleIntegration: one(googleIntegrations),
}));

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  user: one(users, { fields: [connections.userId], references: [users.id] }),
  syncConfigurations: many(syncConfigurations),
}));

export const googleIntegrationsRelations = relations(googleIntegrations, ({ one }) => ({
  user: one(users, { fields: [googleIntegrations.userId], references: [users.id] }),
}));

export const syncConfigurationsRelations = relations(syncConfigurations, ({ one, many }) => ({
  user: one(users, { fields: [syncConfigurations.userId], references: [users.id] }),
  connection: one(connections, { fields: [syncConfigurations.connectionId], references: [connections.id] }),
  mappings: many(syncMappings),
  runs: many(syncRuns),
  conflicts: many(syncConflicts),
}));

export const syncMappingsRelations = relations(syncMappings, ({ one }) => ({
  syncConfiguration: one(syncConfigurations, {
    fields: [syncMappings.syncConfigurationId],
    references: [syncConfigurations.id],
  }),
}));

export const syncRunsRelations = relations(syncRuns, ({ one }) => ({
  syncConfiguration: one(syncConfigurations, {
    fields: [syncRuns.syncConfigurationId],
    references: [syncConfigurations.id],
  }),
}));

export const syncConflictsRelations = relations(syncConflicts, ({ one }) => ({
  syncConfiguration: one(syncConfigurations, {
    fields: [syncConflicts.syncConfigurationId],
    references: [syncConfigurations.id],
  }),
  syncRun: one(syncRuns, { fields: [syncConflicts.syncRunId], references: [syncRuns.id] }),
}));

export type User = typeof users.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type GoogleIntegration = typeof googleIntegrations.$inferSelect;
export type SyncConfiguration = typeof syncConfigurations.$inferSelect;
export type SyncMapping = typeof syncMappings.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type SyncConflict = typeof syncConflicts.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type SyncDirection = (typeof syncDirectionEnum.enumValues)[number];
export type ConflictStrategy = (typeof conflictStrategyEnum.enumValues)[number];
export type HealthStatus = (typeof healthStatusEnum.enumValues)[number];
export type SslMode = (typeof sslModeEnum.enumValues)[number];
export type SyncRunStatus = (typeof syncRunStatusEnum.enumValues)[number];
export type ConflictType = (typeof conflictTypeEnum.enumValues)[number];
