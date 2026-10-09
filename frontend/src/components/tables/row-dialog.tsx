import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { CellValue, ColumnInfo, Row, TableMeta } from "@/types/api";
import { cellInputValue, columnTypeLabel, parseCellInput } from "./cell";

type DraftValue = { text: string; isNull: boolean };

function initialDraft(meta: TableMeta, row: Row | null): Record<string, DraftValue> {
  const draft: Record<string, DraftValue> = {};
  for (const column of meta.columns) {
    const value = row ? row[column.name] : undefined;
    // On insert every field starts empty and untouched, so column defaults apply.
    draft[column.name] = { text: cellInputValue(value ?? null), isNull: row ? value === null || value === undefined : false };
  }
  return draft;
}

/** Insert or edit a single row. Each field can be set to NULL explicitly or left to its default. */
export function RowDialog({
  open,
  onClose,
  meta,
  row,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  meta: TableMeta;
  row: Row | null;
  submitting: boolean;
  error?: string | null;
  onSubmit: (values: Row) => void;
}) {
  const editing = row !== null;
  const [draft, setDraft] = useState<Record<string, DraftValue>>(() => initialDraft(meta, row));
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const setField = (name: string, patch: Partial<DraftValue>) => {
    setDraft((current) => ({ ...current, [name]: { ...current[name]!, ...patch } }));
    setTouched((current) => new Set(current).add(name));
  };

  const editableColumns = meta.columns.filter((column) => !column.isGenerated);

  const submit = () => {
    const values: Row = {};
    for (const column of editableColumns) {
      const field = draft[column.name]!;
      // On insert, untouched columns with a default are omitted so PostgreSQL applies it.
      if (!editing && !touched.has(column.name) && column.hasDefault) continue;
      if (editing && !touched.has(column.name)) continue;
      values[column.name] = field.isNull ? null : parseCellInput(field.text, column);
    }
    onSubmit(values);
  };

  const control = (column: ColumnInfo) => {
    const field = draft[column.name]!;
    const id = `row-${column.name}`;
    if (column.kind === "boolean") {
      return (
        <Select
          id={id}
          value={field.isNull ? "" : field.text}
          onChange={(event) => setField(column.name, { text: event.target.value, isNull: event.target.value === "" })}
        >
          <option value="">NULL</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </Select>
      );
    }
    if (column.kind === "json" || column.kind === "array") {
      return (
        <Textarea
          id={id}
          value={field.text}
          placeholder={field.isNull ? "NULL" : column.kind === "array" ? '["a","b"]' : '{"key":"value"}'}
          onChange={(event) => setField(column.name, { text: event.target.value, isNull: false })}
        />
      );
    }
    const inputType = column.kind === "integer" || column.kind === "number" ? "text" : column.kind === "date" ? "date" : "text";
    return (
      <Input
        id={id}
        type={inputType}
        inputMode={column.kind === "integer" || column.kind === "number" ? "decimal" : undefined}
        value={field.text}
        spellCheck={false}
        placeholder={field.isNull ? "NULL" : column.defaultValue ?? ""}
        onChange={(event) => setField(column.name, { text: event.target.value, isNull: false })}
      />
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Edit row in ${meta.schema}.${meta.name}` : `Insert row into ${meta.schema}.${meta.name}`}
      description={editing ? "Only the fields you change are written." : "Fields left untouched use their column default."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={submitting} loadingText="Saving…">
            {editing ? "Save row" : "Insert row"}
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {editableColumns.map((column) => {
          const field = draft[column.name]!;
          return (
            <Field
              key={column.name}
              label={column.name}
              htmlFor={`row-${column.name}`}
              hint={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{columnTypeLabel(column)}</span>
                  {column.nullable && column.kind !== "boolean" ? (
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="accent-[#4f7fa3]"
                        checked={field.isNull}
                        onChange={(event) => setField(column.name, { isNull: event.target.checked, text: event.target.checked ? "" : field.text })}
                      />
                      NULL
                    </label>
                  ) : null}
                </span>
              }
            >
              {control(column)}
            </Field>
          );
        })}
      </div>
      {meta.columns.some((column) => column.isGenerated) ? (
        <p className="mt-4 text-xs text-muted">
          Generated columns ({meta.columns.filter((c) => c.isGenerated).map((c) => c.name).join(", ")}) are set by PostgreSQL and cannot be edited.
        </p>
      ) : null}
    </Dialog>
  );
}

export type { CellValue };
