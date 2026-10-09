export type HealthStatus = "UNKNOWN" | "CONNECTED" | "DEGRADED" | "DISCONNECTED";
export type SslMode = "disable" | "require" | "verify-full";
export type SyncDirection = "POSTGRES_TO_SHEETS" | "SHEETS_TO_POSTGRES" | "BIDIRECTIONAL";
export type ConflictStrategy = "LAST_WRITE_WINS" | "POSTGRES_WINS" | "GOOGLE_SHEETS_WINS" | "MANUAL";
export type DeleteMode = "CONFIRM" | "NEVER";
export type SyncRunStatus = "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
export type ConflictType = "UPDATE_UPDATE" | "UPDATE_DELETE" | "DELETE_UPDATE" | "INSERT_INSERT";
export type ConflictStatus = "OPEN" | "RESOLVED_AUTO" | "RESOLVED_MANUAL" | "DISMISSED";

export interface PublicConfig {
  authMode: "supabase" | "dev";
  databaseConfigured: boolean;
  googleConfigured: boolean;
  encryptionKeyConfigured: boolean;
  environment: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: SslMode;
  healthStatus: HealthStatus;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  serverVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionInput {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: SslMode;
}

export interface ConnectionTestResult {
  ok: boolean;
  status: HealthStatus;
  latencyMs: number | null;
  serverVersion: string | null;
  database: string | null;
  error: string | null;
  checkedAt: string;
}

export type ColumnKind = "integer" | "number" | "boolean" | "date" | "timestamp" | "timestamptz" | "json" | "array" | "uuid" | "text";

export interface ColumnInfo {
  name: string;
  dataType: string;
  kind: ColumnKind;
  nullable: boolean;
  defaultValue: string | null;
  hasDefault: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isGenerated: boolean;
  position: number;
}

export interface SchemaInfo {
  name: string;
  tableCount: number;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: "table" | "view" | "materialized_view" | "partitioned_table";
  estimatedRows: number | null;
  sizeBytes: number | null;
}

export interface TableMeta extends TableInfo {
  columns: ColumnInfo[];
  primaryKey: string[];
  editable: boolean;
}

export type CellValue = string | number | boolean | null | Record<string, unknown> | unknown[];
export type Row = Record<string, CellValue>;

export type FilterOperator = "eq" | "neq" | "contains" | "starts_with" | "gt" | "gte" | "lt" | "lte" | "is_null" | "not_null";

export interface RowFilter {
  column: string;
  op: FilterOperator;
  value?: string;
}

export interface RowsPage {
  rows: Row[];
  page: number;
  pageSize: number;
  total: number | null;
  totalIsEstimate: boolean;
}

export interface GoogleIntegration {
  id: string;
  googleEmail: string | null;
  scopes: string[];
  healthStatus: HealthStatus;
  lastError: string | null;
  lastCheckedAt: string | null;
  connectedAt: string;
  hasRefreshToken: boolean;
}

export interface GoogleStatus {
  configured: boolean;
  integration: GoogleIntegration | null;
}

export interface GoogleHealth {
  configured: boolean;
  connected: boolean;
  status: HealthStatus;
  checks: Array<{ name: string; ok: boolean; message: string }>;
  integration: GoogleIntegration | null;
}

export interface Spreadsheet {
  id: string;
  name: string;
  modifiedTime: string | null;
  owner: string | null;
  url: string;
}

export interface Worksheet {
  id: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetDetail {
  id: string;
  name: string;
  url: string;
  worksheets: Worksheet[];
}

export interface WorksheetPreview {
  worksheet: Worksheet;
  headers: string[];
  rows: Array<Array<string | number | boolean>>;
  suggestedMappings: ColumnMapping[];
}

export interface ColumnMapping {
  pgColumn: string;
  sheetColumn: string;
}

export interface SyncConfiguration {
  id: string;
  name: string;
  connectionId: string;
  databaseName: string | null;
  schemaName: string;
  tableName: string;
  keyColumn: string;
  timestampColumn: string | null;
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetId: number;
  worksheetTitle: string;
  direction: SyncDirection;
  conflictStrategy: ConflictStrategy;
  deleteMode: DeleteMode;
  scheduleMinutes: number | null;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastRunStatus: SyncRunStatus | null;
  createdAt: string;
  updatedAt: string;
  runningRunId: string | null;
  mappingCount?: number;
  mappings?: Array<ColumnMapping & { id: string; position: number }>;
}

export interface SyncConfigInput {
  name: string;
  connectionId: string;
  databaseName?: string | null;
  schemaName: string;
  tableName: string;
  keyColumn: string;
  timestampColumn?: string | null;
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetId: number;
  worksheetTitle: string;
  direction: SyncDirection;
  conflictStrategy: ConflictStrategy;
  deleteMode: DeleteMode;
  scheduleMinutes?: number | null;
  enabled: boolean;
  mappings: ColumnMapping[];
}

export interface MappingValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SideCounts {
  inserted: number;
  updated: number;
  deleted: number;
}

export interface SyncRun {
  id: string;
  syncConfigurationId: string;
  direction: SyncDirection;
  trigger: "MANUAL" | "SCHEDULED";
  status: SyncRunStatus;
  startedAt: string;
  finishedAt: string | null;
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeleted: number;
  conflictsCount: number;
  errorsCount: number;
  errorMessage: string | null;
  errors: string[];
  details: { postgres: SideCounts; sheets: SideCounts; skippedDeletes?: number; notes?: string[] } | null;
  syncName?: string;
  tableName?: string;
  worksheetTitle?: string;
}

export interface SyncPreview {
  postgres: { inserts: number; updates: number; deletes: number };
  sheets: { inserts: number; updates: number; deletes: number };
  conflicts: Array<{ key: string; type: ConflictType; resolution: "POSTGRES" | "SHEETS" | null; message: string }>;
  unresolvedConflicts: number;
  unchanged: number;
  unmanaged: number;
  newSheetRows: number;
  deletesRequireConfirmation: boolean;
  deleteMode: DeleteMode;
  issues: string[];
}

export interface SyncConflict {
  id: string;
  syncConfigurationId: string;
  syncRunId: string | null;
  rowKey: string;
  type: ConflictType;
  strategy: ConflictStrategy;
  status: ConflictStatus;
  resolution: "POSTGRES" | "SHEETS" | null;
  postgresValues: Record<string, string> | null;
  sheetValues: Record<string, string> | null;
  message: string;
  resolvedAt: string | null;
  createdAt: string;
  syncName: string;
  tableName: string;
  schemaName: string;
  keyColumn: string;
  worksheetTitle: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  status: "SUCCESS" | "FAILURE" | "INFO";
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DashboardSummary {
  connections: {
    total: number;
    healthy: number;
    items: Array<Pick<Connection, "id" | "name" | "host" | "database" | "healthStatus" | "lastLatencyMs" | "lastCheckedAt" | "lastError">>;
  };
  syncs: { total: number; enabled: number; running: number };
  lastRun: (SyncRun & { syncName: string }) | null;
  rowsSynchronized: number;
  totalRuns: number;
  failedRunsLast30Days: number;
  openConflicts: number;
  google: { googleEmail: string | null; healthStatus: HealthStatus; lastCheckedAt: string | null; lastError: string | null } | null;
  recentActivity: ActivityLog[];
}
