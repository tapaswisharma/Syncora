import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CircleAlert,
  Database,
  FileSpreadsheet,
  GitCompareArrows,
  Plug,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ColumnMappingEditor } from "@/components/sync/column-mapping";
import { SheetPreview } from "@/components/sync/sheet-preview";
import { SpreadsheetPicker } from "@/components/sync/spreadsheet-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, InlineNotice } from "@/components/ui/error-state";
import { Field, Input, Select } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { HealthBadge } from "@/components/ui/status";
import { useConnections } from "@/hooks/use-connections";
import { useConnectGoogle, useGoogleStatus, useSpreadsheet, useWorksheetPreview } from "@/hooks/use-google";
import { useCreateSync, useValidateSync } from "@/hooks/use-sync";
import { useSchemas, useTableMeta, useTables } from "@/hooks/use-tables";
import { errorText } from "@/lib/api";
import { cn } from "@/lib/cn";
import { allowedStrategies, autoMap, directionLabels, strategyLabels } from "@/lib/mapping";
import { useSyncWizardStore, WIZARD_STEPS } from "@/stores/sync-wizard-store";
import type { ConflictStrategy, MappingValidation, SyncDirection } from "@/types/api";

function Stepper({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return (
    <ol className="scrollbar-thin mb-6 flex gap-1 overflow-x-auto pb-1">
      {WIZARD_STEPS.map((label, index) => {
        const state = index === step ? "current" : index < step ? "done" : "todo";
        return (
          <li key={label} className="shrink-0">
            <button
              type="button"
              disabled={index > step}
              onClick={() => onStep(index)}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                state === "current" && "bg-primary text-[#0f2433]",
                state === "done" && "bg-primary-soft text-primary-ink hover:bg-primary/40",
                state === "todo" && "text-subtle",
              )}
            >
              <span className="flex size-4 items-center justify-center rounded-full border border-current text-[10px]">
                {state === "done" ? <Check aria-hidden className="size-2.5" /> : index + 1}
              </span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ValidationMessages({ validation }: { validation: MappingValidation | undefined }) {
  if (!validation) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      {validation.errors.map((message) => (
        <p key={message} className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {message}
        </p>
      ))}
      {validation.warnings.map((message) => (
        <p key={message} className="rounded-lg border border-secondary bg-secondary-soft px-3 py-2 text-sm text-secondary-ink">
          {message}
        </p>
      ))}
      {validation.valid && validation.warnings.length === 0 ? (
        <p className="rounded-lg border border-success bg-success-soft px-3 py-2 text-sm text-success-ink">This configuration is valid.</p>
      ) : null}
    </div>
  );
}

export default function SyncNewPage() {
  const navigate = useNavigate();
  // Subscribe to the two pieces of wizard state; actions are read once and never change identity.
  const step = useSyncWizardStore((state) => state.step);
  const draft = useSyncWizardStore((state) => state.draft);
  const { setStep, next, back, update, reset } = useSyncWizardStore.getState();
  const connections = useConnections();
  const google = useGoogleStatus();
  const connectGoogle = useConnectGoogle();
  const schemas = useSchemas(draft.connectionId, draft.databaseName ?? undefined);
  const tables = useTables(draft.connectionId, draft.schemaName, draft.databaseName ?? undefined);
  const tableMeta = useTableMeta(draft.connectionId, draft.schemaName, draft.tableName, draft.databaseName ?? undefined);
  const spreadsheet = useSpreadsheet(draft.spreadsheetId);
  const mappedColumns = useMemo(() => draft.mappings.map((mapping) => mapping.pgColumn), [draft.mappings]);
  const preview = useWorksheetPreview(draft.spreadsheetId, draft.worksheetId, mappedColumns);
  const validate = useValidateSync();
  const create = useCreateSync();
  const [validation, setValidation] = useState<MappingValidation | undefined>();

  useEffect(() => () => reset(), [reset]);

  // Default the row identifier to the primary key and pre-fill mappings once the table is known.
  useEffect(() => {
    const meta = tableMeta.data;
    if (!meta) return;
    if (!draft.keyColumn || !meta.columns.some((column) => column.name === draft.keyColumn)) {
      const candidate = meta.primaryKey[0] ?? meta.columns.find((column) => column.isUnique)?.name ?? meta.columns[0]?.name ?? null;
      update({ keyColumn: candidate });
    }
  }, [tableMeta.data, draft.keyColumn, update]);

  useEffect(() => {
    if (!tableMeta.data || draft.mappings.length || !preview.data) return;
    update({ mappings: autoMap(tableMeta.data.columns.filter((column) => !column.isGenerated).map((column) => column.name), preview.data.headers) });
  }, [tableMeta.data, preview.data, draft.mappings.length, update]);

  // Keep the conflict strategy legal for the chosen direction.
  useEffect(() => {
    const allowed = allowedStrategies(draft.direction);
    if (!allowed.includes(draft.conflictStrategy)) update({ conflictStrategy: allowed[0]! });
  }, [draft.direction, draft.conflictStrategy, update]);

  const runValidation = () => {
    if (!draft.connectionId || !draft.schemaName || !draft.tableName || !draft.keyColumn || !draft.spreadsheetId || draft.worksheetId === null) return;
    validate.mutate(
      {
        connectionId: draft.connectionId,
        databaseName: draft.databaseName,
        schemaName: draft.schemaName,
        tableName: draft.tableName,
        keyColumn: draft.keyColumn,
        timestampColumn: draft.timestampColumn,
        spreadsheetId: draft.spreadsheetId,
        worksheetId: draft.worksheetId,
        direction: draft.direction,
        conflictStrategy: draft.conflictStrategy,
        mappings: draft.mappings,
      },
      { onSuccess: setValidation, onError: () => setValidation(undefined) },
    );
  };

  const canContinue = (() => {
    switch (step) {
      case 0:
        return Boolean(draft.connectionId);
      case 1:
        return Boolean(draft.schemaName && draft.tableName && draft.keyColumn);
      case 2:
        return Boolean(google.data?.integration);
      case 3:
        return Boolean(draft.spreadsheetId) && draft.worksheetId !== null;
      case 4:
        return draft.mappings.length > 0 && draft.mappings.every((mapping) => mapping.sheetColumn.trim());
      default:
        return true;
    }
  })();

  const timestampCandidates = (tableMeta.data?.columns ?? []).filter((column) => ["timestamp", "timestamptz", "date"].includes(column.kind));

  const submit = () => {
    if (!draft.connectionId || !draft.schemaName || !draft.tableName || !draft.keyColumn || !draft.spreadsheetId || draft.worksheetId === null) return;
    create.mutate(
      {
        name: draft.name.trim() || `${draft.tableName} ↔ ${draft.worksheetTitle}`,
        connectionId: draft.connectionId,
        databaseName: draft.databaseName,
        schemaName: draft.schemaName,
        tableName: draft.tableName,
        keyColumn: draft.keyColumn,
        timestampColumn: draft.conflictStrategy === "LAST_WRITE_WINS" ? draft.timestampColumn : null,
        spreadsheetId: draft.spreadsheetId,
        spreadsheetName: draft.spreadsheetName ?? "Spreadsheet",
        worksheetId: draft.worksheetId,
        worksheetTitle: draft.worksheetTitle ?? "Sheet1",
        direction: draft.direction,
        conflictStrategy: draft.conflictStrategy,
        deleteMode: draft.deleteMode,
        scheduleMinutes: draft.scheduleMinutes,
        enabled: true,
        mappings: draft.mappings,
      },
      {
        onSuccess: (sync) => {
          toast.success(`Created "${sync.name}"`);
          navigate(`/syncs/${sync.id}`);
        },
        onError: (error) => toast.error(errorText(error)),
      },
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="New sync"
        title={WIZARD_STEPS[step]!}
        description="Pair a PostgreSQL table with a Google Sheets worksheet. Nothing is written until you run the sync."
        actions={<LinkButton to="/syncs" variant="outline">Cancel</LinkButton>}
      />
      <Stepper step={step} onStep={setStep} />

      <Card className="p-5">
        {/* Step 1: connection */}
        {step === 0 ? (
          connections.isLoading ? (
            <SkeletonRows rows={3} />
          ) : connections.data?.length ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm text-muted">Choose the PostgreSQL connection that holds the table you want to sync.</legend>
              {connections.data.map((connection) => (
                <label
                  key={connection.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                    draft.connectionId === connection.id ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="connection"
                    className="accent-[#4f7fa3]"
                    checked={draft.connectionId === connection.id}
                    onChange={() => update({ connectionId: connection.id, schemaName: null, tableName: null, keyColumn: null, mappings: [] })}
                  />
                  <Database aria-hidden className="size-4 text-primary-strong" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{connection.name}</span>
                    <span className="block truncate font-mono text-xs text-muted">
                      {connection.host}:{connection.port}/{connection.database}
                    </span>
                  </span>
                  <HealthBadge status={connection.healthStatus} />
                </label>
              ))}
            </fieldset>
          ) : (
            <EmptyState
              icon={<Plug className="size-5" />}
              title="No PostgreSQL connections yet"
              description="Add a connection before creating a sync."
              action={<LinkButton to="/connections">Add a connection</LinkButton>}
            />
          )
        ) : null}

        {/* Step 2: schema, table, key */}
        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Schema" htmlFor="wizard-schema">
                <Select
                  id="wizard-schema"
                  value={draft.schemaName ?? ""}
                  disabled={schemas.isLoading}
                  onChange={(event) => update({ schemaName: event.target.value, tableName: null, keyColumn: null, mappings: [] })}
                >
                  <option value="">Choose a schema…</option>
                  {schemas.data?.map((schema) => (
                    <option key={schema.name} value={schema.name}>
                      {schema.name} ({schema.tableCount} tables)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Table" htmlFor="wizard-table">
                <Select
                  id="wizard-table"
                  value={draft.tableName ?? ""}
                  disabled={!draft.schemaName || tables.isLoading}
                  onChange={(event) => update({ tableName: event.target.value, keyColumn: null, mappings: [] })}
                >
                  <option value="">Choose a table…</option>
                  {tables.data?.map((table) => (
                    <option key={table.name} value={table.name}>
                      {table.name}
                      {table.type !== "table" ? ` (${table.type})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {schemas.isError ? <ErrorState error={schemas.error} onRetry={() => void schemas.refetch()} title="Could not read the database" /> : null}

            {tableMeta.isLoading ? (
              <Spinner label="Reading table structure…" />
            ) : tableMeta.data ? (
              <>
                <Field
                  label="Row identifier"
                  htmlFor="wizard-key"
                  hint="The column used to match a database row with a sheet row. A primary key or unique column is strongly recommended."
                >
                  <Select id="wizard-key" value={draft.keyColumn ?? ""} onChange={(event) => update({ keyColumn: event.target.value })}>
                    {tableMeta.data.columns
                      .filter((column) => !["json", "array"].includes(column.kind))
                      .map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name} ({column.dataType}){column.isPrimaryKey ? " — primary key" : column.isUnique ? " — unique" : ""}
                        </option>
                      ))}
                  </Select>
                </Field>
                {tableMeta.data.primaryKey.length === 0 ? (
                  <InlineNotice tone="warning">
                    This table has no primary key. Pick a column whose values are unique, or rows may be matched incorrectly.
                  </InlineNotice>
                ) : null}
                {!tableMeta.data.editable ? (
                  <InlineNotice tone="warning">This relation is read-only, so only PostgreSQL → Google Sheets will work.</InlineNotice>
                ) : null}
                <div className="rounded-xl border border-border">
                  <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted">
                    {tableMeta.data.columns.length} columns in {tableMeta.data.schema}.{tableMeta.data.name}
                  </div>
                  <ul className="scrollbar-thin flex max-h-40 flex-wrap gap-1.5 overflow-y-auto p-3">
                    {tableMeta.data.columns.map((column) => (
                      <li key={column.name}>
                        <Badge tone={column.isPrimaryKey ? "primary" : "neutral"}>
                          <span className="font-mono">{column.name}</span>
                          <span className="text-subtle">{column.dataType}</span>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Step 3: Google account */}
        {step === 2 ? (
          google.isLoading ? (
            <SkeletonRows rows={2} />
          ) : !google.data?.configured ? (
            <InlineNotice tone="warning">
              Google integration is not configured on the server. Set <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> in <code className="font-mono text-xs">backend/.env</code>, then restart the API.
            </InlineNotice>
          ) : google.data.integration ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success bg-success-soft px-4 py-3">
              <FileSpreadsheet aria-hidden className="size-5 text-success-strong" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-success-ink">Google account connected</p>
                <p className="truncate text-xs text-success-ink/80">{google.data.integration.googleEmail ?? "Connected"}</p>
              </div>
              <HealthBadge status={google.data.integration.healthStatus} />
            </div>
          ) : (
            <EmptyState
              icon={<FileSpreadsheet className="size-5" />}
              title="Connect your Google account"
              description="DBSynchro needs access to your spreadsheets to read and write them. You can revoke access at any time in Settings."
              action={
                <Button variant="sheets" loading={connectGoogle.isPending} loadingText="Opening Google…" onClick={() => connectGoogle.mutate()}>
                  Connect Google account
                </Button>
              }
            />
          )
        ) : null}

        {/* Step 4: spreadsheet + worksheet */}
        {step === 3 ? (
          <div className="space-y-5">
            <SpreadsheetPicker
              selectedId={draft.spreadsheetId}
              onSelect={(sheet) => update({ spreadsheetId: sheet.id, spreadsheetName: sheet.name, worksheetId: null, worksheetTitle: null })}
            />
            {draft.spreadsheetId ? (
              spreadsheet.isLoading ? (
                <Spinner label="Loading worksheets…" />
              ) : spreadsheet.isError ? (
                <ErrorState error={spreadsheet.error} onRetry={() => void spreadsheet.refetch()} title="Could not open the spreadsheet" />
              ) : spreadsheet.data ? (
                <Field label="Worksheet" htmlFor="wizard-worksheet" hint="Row 1 is treated as the header row.">
                  <Select
                    id="wizard-worksheet"
                    value={draft.worksheetId ?? ""}
                    onChange={(event) => {
                      const worksheet = spreadsheet.data!.worksheets.find((sheet) => sheet.id === Number(event.target.value));
                      update({ worksheetId: worksheet?.id ?? null, worksheetTitle: worksheet?.title ?? null, mappings: [] });
                    }}
                  >
                    <option value="">Choose a worksheet…</option>
                    {spreadsheet.data.worksheets.map((worksheet) => (
                      <option key={worksheet.id} value={worksheet.id}>
                        {worksheet.title} ({worksheet.rowCount}×{worksheet.columnCount})
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null
            ) : null}
            {draft.worksheetId !== null ? (
              preview.isLoading ? (
                <Spinner label="Reading the worksheet…" />
              ) : preview.isError ? (
                <ErrorState error={preview.error} onRetry={() => void preview.refetch()} title="Could not read the worksheet" />
              ) : preview.data ? (
                <SheetPreview headers={preview.data.headers} rows={preview.data.rows} />
              ) : null
            ) : null}
          </div>
        ) : null}

        {/* Step 5: column mapping */}
        {step === 4 ? (
          tableMeta.data ? (
            <ColumnMappingEditor
              columns={tableMeta.data.columns}
              sheetHeaders={preview.data?.headers ?? []}
              mappings={draft.mappings}
              keyColumn={draft.keyColumn}
              onChange={(mappings) => update({ mappings })}
              onAutoMap={() =>
                update({
                  mappings: autoMap(
                    tableMeta.data!.columns.filter((column) => !column.isGenerated).map((column) => column.name),
                    preview.data?.headers ?? [],
                  ),
                })
              }
            />
          ) : (
            <Spinner label="Loading columns…" />
          )
        ) : null}

        {/* Step 6: direction */}
        {step === 5 ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-muted">Which way should data flow?</legend>
            {(Object.keys(directionLabels) as SyncDirection[]).map((direction) => (
              <label
                key={direction}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors",
                  draft.direction === direction ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="direction"
                  className="mt-1 accent-[#4f7fa3]"
                  checked={draft.direction === direction}
                  onChange={() => update({ direction })}
                />
                <span>
                  <span className="block text-sm font-medium">{directionLabels[direction].title}</span>
                  <span className="block text-xs text-muted">{directionLabels[direction].description}</span>
                </span>
              </label>
            ))}
            <Field label="Deletions" htmlFor="wizard-delete" className="pt-2" hint="Deletions are never applied without an explicit confirmation when you run a sync.">
              <Select id="wizard-delete" value={draft.deleteMode} onChange={(event) => update({ deleteMode: event.target.value as "CONFIRM" | "NEVER" })}>
                <option value="CONFIRM">Propagate deletions after I confirm them</option>
                <option value="NEVER">Never delete rows</option>
              </Select>
            </Field>
            <Field label="Schedule" htmlFor="wizard-schedule" hint="Scheduled runs never delete rows. Leave off to sync only when you press “Sync now”.">
              <Select
                id="wizard-schedule"
                value={draft.scheduleMinutes ?? ""}
                onChange={(event) => update({ scheduleMinutes: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">Manual only</option>
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="60">Hourly</option>
                <option value="1440">Daily</option>
              </Select>
            </Field>
          </fieldset>
        ) : null}

        {/* Step 7: conflicts */}
        {step === 6 ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-muted">
              When the same row changed on both sides since the last sync, DBSynchro records a conflict. Choose how it should be resolved.
            </legend>
            {allowedStrategies(draft.direction).map((strategy: ConflictStrategy) => (
              <label
                key={strategy}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors",
                  draft.conflictStrategy === strategy ? "border-secondary bg-secondary-soft" : "border-border hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="strategy"
                  className="mt-1 accent-[#c46b7b]"
                  checked={draft.conflictStrategy === strategy}
                  onChange={() => update({ conflictStrategy: strategy })}
                />
                <span>
                  <span className="block text-sm font-medium">{strategyLabels[strategy].title}</span>
                  <span className="block text-xs text-muted">{strategyLabels[strategy].description}</span>
                </span>
              </label>
            ))}
            {draft.conflictStrategy === "LAST_WRITE_WINS" ? (
              <Field
                label="Timestamp column"
                htmlFor="wizard-timestamp"
                className="pt-2"
                hint="Compared against the spreadsheet's last-modified time. Without one, conflicts are left for manual review."
              >
                <Select id="wizard-timestamp" value={draft.timestampColumn ?? ""} onChange={(event) => update({ timestampColumn: event.target.value || null })}>
                  <option value="">None</option>
                  {timestampCandidates.map((column) => (
                    <option key={column.name} value={column.name}>
                      {column.name} ({column.dataType})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </fieldset>
        ) : null}

        {/* Step 8: review */}
        {step === 7 ? (
          <div className="space-y-5">
            <Field label="Sync name" htmlFor="wizard-name" hint="Shown in lists, history and activity.">
              <Input
                id="wizard-name"
                value={draft.name}
                placeholder={`${draft.tableName} ↔ ${draft.worksheetTitle}`}
                onChange={(event) => update({ name: event.target.value })}
              />
            </Field>
            <dl className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">PostgreSQL</dt>
                <dd className="font-mono text-xs">
                  {draft.schemaName}.{draft.tableName} · key {draft.keyColumn}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Google Sheets</dt>
                <dd className="truncate text-xs">
                  {draft.spreadsheetName} / {draft.worksheetTitle}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Direction</dt>
                <dd className="flex items-center gap-1.5 text-xs">
                  <ArrowLeftRight aria-hidden className="size-3.5 text-primary-strong" />
                  {directionLabels[draft.direction].title}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Conflicts</dt>
                <dd className="flex items-center gap-1.5 text-xs">
                  <GitCompareArrows aria-hidden className="size-3.5 text-secondary-strong" />
                  {strategyLabels[draft.conflictStrategy].title}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Columns</dt>
                <dd className="text-xs">{draft.mappings.length} mapped</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Schedule</dt>
                <dd className="text-xs">{draft.scheduleMinutes ? `Every ${draft.scheduleMinutes} minutes` : "Manual only"}</dd>
              </div>
            </dl>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-muted">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 text-left font-medium">
                      PostgreSQL
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-left font-medium">
                      Google Sheets
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.mappings.map((mapping) => (
                    <tr key={mapping.pgColumn} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono">{mapping.pgColumn}</td>
                      <td className="px-3 py-1.5">{mapping.sheetColumn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={runValidation} loading={validate.isPending} loadingText="Checking…">
                <Check aria-hidden className="size-3.5" /> Validate configuration
              </Button>
              {validate.isError ? <span className="text-sm text-danger">{errorText(validate.error)}</span> : null}
            </div>
            <ValidationMessages validation={validation} />
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <Button variant="ghost" onClick={back} disabled={step === 0}>
            <ArrowLeft aria-hidden className="size-4" /> Back
          </Button>
          {step < WIZARD_STEPS.length - 1 ? (
            <Button variant="primary" onClick={next} disabled={!canContinue}>
              Continue <ArrowRight aria-hidden className="size-4" />
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} loading={create.isPending} loadingText="Creating…">
              <Table2 aria-hidden className="size-4" /> Create sync
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}
