import { cn } from "@/lib/cn";
import type { CellValue, ColumnInfo } from "@/types/api";

/** Human-readable text for a cell. NULL is shown explicitly, never as an empty gap. */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The editable string form of a cell (NULL becomes an empty input). */
export function cellInputValue(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Converts text typed into an input back into a JSON value for the API.
 * Empty input means NULL for every type except text, where it means an empty string.
 */
export function parseCellInput(text: string, column: ColumnInfo): CellValue {
  const trimmed = text.trim();
  if (trimmed === "") return column.kind === "text" ? "" : null;
  switch (column.kind) {
    case "integer":
    case "number":
      return Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
    case "boolean":
      if (["true", "t", "yes", "1"].includes(trimmed.toLowerCase())) return true;
      if (["false", "f", "no", "0"].includes(trimmed.toLowerCase())) return false;
      return trimmed;
    case "json":
    case "array":
      try {
        return JSON.parse(trimmed) as CellValue;
      } catch {
        return trimmed;
      }
    default:
      return text;
  }
}

export function Cell({ value, kind }: { value: CellValue; kind: ColumnInfo["kind"] }) {
  if (value === null || value === undefined) {
    return <span className="text-subtle italic">NULL</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={cn("rounded px-1.5 py-0.5 font-mono text-[11px]", value ? "bg-success-soft text-success-ink" : "bg-surface-muted text-muted")}>
        {value ? "true" : "false"}
      </span>
    );
  }
  if (kind === "json" || kind === "array" || typeof value === "object") {
    return <span className="font-mono text-[11px] text-muted">{JSON.stringify(value)}</span>;
  }
  if (kind === "integer" || kind === "number") {
    return <span className="tabular font-mono text-xs">{String(value)}</span>;
  }
  if (kind === "timestamp" || kind === "timestamptz" || kind === "date" || kind === "uuid") {
    return <span className="font-mono text-[11px]">{String(value)}</span>;
  }
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}

export function columnTypeLabel(column: ColumnInfo): string {
  const flags = [column.isPrimaryKey ? "PK" : null, !column.nullable ? "NOT NULL" : null, column.isGenerated ? "generated" : null].filter(Boolean);
  return [column.dataType, ...flags].join(" · ");
}
