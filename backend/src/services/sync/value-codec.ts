import { createHash } from "node:crypto";
import type { ColumnKind } from "../postgres/introspection.service.js";
import type { SheetCell } from "../google/sheets.service.js";
import type { CanonicalRow } from "./types.js";

const TRUE_WORDS = new Set(["true", "t", "yes", "y", "1"]);
const FALSE_WORDS = new Set(["false", "f", "no", "n", "0"]);
const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const INTEGER = /^[+-]?\d+$/;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stableStringify(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizeTimestamp(value: string, withTimeZone: boolean): string {
  let text = value.trim().replace(" ", "T");
  if (withTimeZone) {
    text = text.replace(/([+-]\d{2})$/, "$1:00");
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  const parsed = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().replace(/Z$/, "");
}

/**
 * Converts a value from either side into one canonical string so PostgreSQL and Sheets
 * values can be compared reliably (e.g. numeric "10.50" and the sheet number 10.5 are equal).
 */
export function canonicalize(value: unknown, kind: ColumnKind): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;

  switch (kind) {
    case "integer":
    case "number": {
      if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
      if (typeof value === "boolean") return value ? "1" : "0";
      const text = String(value).trim();
      if (text === "") return "";
      if (INTEGER.test(text)) return BigInt(text).toString();
      if (NUMERIC.test(text)) return String(Number(text));
      return text;
    }
    case "boolean": {
      if (typeof value === "boolean") return value ? "true" : "false";
      const text = String(value).trim().toLowerCase();
      if (TRUE_WORDS.has(text)) return "true";
      if (FALSE_WORDS.has(text)) return "false";
      return text;
    }
    case "json": {
      if (typeof value === "object") return stableStringify(value);
      const text = String(value).trim();
      if (text === "") return "";
      try {
        return stableStringify(JSON.parse(text));
      } catch {
        return text;
      }
    }
    case "array": {
      if (Array.isArray(value)) return JSON.stringify(value);
      const text = String(value).trim();
      if (text === "") return "";
      try {
        const parsed: unknown = JSON.parse(text);
        return Array.isArray(parsed) ? JSON.stringify(parsed) : text;
      } catch {
        return text;
      }
    }
    case "timestamptz":
    case "timestamp": {
      const text = String(value);
      return text.trim() === "" ? "" : normalizeTimestamp(text, kind === "timestamptz");
    }
    case "date": {
      const text = String(value).trim();
      if (text === "" || /^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
      const parsed = Date.parse(text);
      if (Number.isNaN(parsed)) return text;
      const date = new Date(parsed);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    case "uuid":
      return String(value).trim().toLowerCase();
    default:
      if (typeof value === "object") return stableStringify(value);
      return String(value);
  }
}

/** Value to write into a sheet cell. Numbers and booleans keep their type so Sheets can compute with them. */
export function toSheetCell(canonical: string, kind: ColumnKind): SheetCell {
  if (canonical === "") return "";
  if (kind === "integer" || kind === "number") {
    const numeric = Number(canonical);
    if (Number.isFinite(numeric) && String(numeric) === canonical && (kind === "number" || Number.isSafeInteger(numeric))) {
      return numeric;
    }
    return canonical;
  }
  if (kind === "boolean") {
    if (canonical === "true") return true;
    if (canonical === "false") return false;
  }
  return canonical;
}

/** Parameter for a PostgreSQL write. Empty cells become NULL. */
export function toPgParam(canonical: string, kind: ColumnKind): unknown {
  if (canonical === "") return null;
  if (kind === "array") {
    try {
      const parsed: unknown = JSON.parse(canonical);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // let PostgreSQL report the format error
    }
  }
  return canonical;
}

/** Stable fingerprint of a row's mapped values; used as the sync baseline. */
export function rowHash(row: CanonicalRow, columns: string[]): string {
  const ordered = [...columns].sort().map((column) => row[column] ?? "");
  return createHash("sha1").update(JSON.stringify(ordered)).digest("hex");
}
