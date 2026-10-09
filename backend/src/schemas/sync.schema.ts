import { z } from "zod";

export const syncDirectionSchema = z.enum(["POSTGRES_TO_SHEETS", "SHEETS_TO_POSTGRES", "BIDIRECTIONAL"]);
export const conflictStrategySchema = z.enum(["LAST_WRITE_WINS", "POSTGRES_WINS", "GOOGLE_SHEETS_WINS", "MANUAL"]);

export const columnMappingSchema = z.object({
  pgColumn: z.string().min(1).max(63),
  sheetColumn: z.string().trim().min(1, "Sheet column name is required").max(200),
});

const identifier = z.string().min(1).max(63);

export const syncConfigSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  connectionId: z.uuid("Choose a PostgreSQL connection"),
  databaseName: identifier.nullish(),
  schemaName: identifier,
  tableName: identifier,
  keyColumn: identifier,
  timestampColumn: identifier.nullish(),
  spreadsheetId: z.string().min(10).max(200),
  spreadsheetName: z.string().min(1).max(300),
  worksheetId: z.number().int().min(0),
  worksheetTitle: z.string().min(1).max(200),
  direction: syncDirectionSchema,
  conflictStrategy: conflictStrategySchema,
  deleteMode: z.enum(["CONFIRM", "NEVER"]).default("CONFIRM"),
  scheduleMinutes: z.number().int().min(5, "Schedules run at most every 5 minutes").max(10080).nullish(),
  enabled: z.boolean().default(true),
  mappings: z.array(columnMappingSchema).min(1, "Map at least one column").max(200),
});

export const updateSyncConfigSchema = syncConfigSchema.partial();

export const validateSyncSchema = syncConfigSchema.pick({
  connectionId: true,
  databaseName: true,
  schemaName: true,
  tableName: true,
  keyColumn: true,
  timestampColumn: true,
  spreadsheetId: true,
  worksheetId: true,
  direction: true,
  conflictStrategy: true,
  mappings: true,
});

export const runSyncSchema = z.object({ confirmDeletes: z.boolean().default(false) });

export type SyncConfigInput = z.infer<typeof syncConfigSchema>;
export type UpdateSyncConfigInput = z.infer<typeof updateSyncConfigSchema>;
export type ValidateSyncInput = z.infer<typeof validateSyncSchema>;
