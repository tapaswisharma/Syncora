import type pg from "pg";
import { AppError, badRequest, notFound } from "../../utils/errors.js";
import type { ColumnInfo, TableMeta } from "./introspection.service.js";
import { qualifiedName, quoteIdent } from "./identifiers.js";
import { translatePgError } from "./pg-errors.js";

export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "starts_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_null"
  | "not_null";

export interface RowFilter {
  column: string;
  op: FilterOperator;
  value?: string;
}

export interface RowQuery {
  page: number;
  pageSize: number;
  sort?: string;
  order: "asc" | "desc";
  search?: string;
  filters: RowFilter[];
}

export type CellValue = string | number | boolean | null | Record<string, unknown> | unknown[];
export type RowValues = Record<string, CellValue>;

const comparisonOps: Partial<Record<FilterOperator, string>> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
const MAX_SEARCH_COLUMNS = 25;

function columnMap(meta: TableMeta): Map<string, ColumnInfo> {
  return new Map(meta.columns.map((column) => [column.name, column]));
}

function requireColumn(columns: Map<string, ColumnInfo>, name: string): ColumnInfo {
  const column = columns.get(name);
  if (!column) throw badRequest(`Unknown column "${name}".`);
  return column;
}

/** json columns have no equality operator, so compare their text form. */
function comparable(column: ColumnInfo): string {
  return column.kind === "json" || column.kind === "array" ? `${quoteIdent(column.name)}::text` : quoteIdent(column.name);
}

/** Builds a parameterized WHERE clause. Column names are whitelisted against the catalog. */
export function buildWhere(meta: TableMeta, query: Pick<RowQuery, "search" | "filters">, params: unknown[]): string {
  const columns = columnMap(meta);
  const clauses: string[] = [];

  for (const filter of query.filters) {
    const column = requireColumn(columns, filter.column);
    const ident = quoteIdent(column.name);
    if (filter.op === "is_null") {
      clauses.push(`${ident} is null`);
      continue;
    }
    if (filter.op === "not_null") {
      clauses.push(`${ident} is not null`);
      continue;
    }
    if (filter.value === undefined) throw badRequest(`The filter on "${column.name}" needs a value.`);
    if (filter.op === "contains" || filter.op === "starts_with") {
      params.push(filter.op === "contains" ? `%${escapeLike(filter.value)}%` : `${escapeLike(filter.value)}%`);
      clauses.push(`${ident}::text ilike $${params.length}`);
      continue;
    }
    const operator = comparisonOps[filter.op];
    if (!operator) throw badRequest(`Unsupported filter operator "${filter.op}".`);
    params.push(filter.value);
    clauses.push(`${comparable(column)} ${operator} $${params.length}`);
  }

  const search = query.search?.trim();
  if (search) {
    params.push(`%${escapeLike(search)}%`);
    const placeholder = `$${params.length}`;
    const searchable = meta.columns.slice(0, MAX_SEARCH_COLUMNS);
    clauses.push(`(${searchable.map((column) => `${quoteIdent(column.name)}::text ilike ${placeholder}`).join(" or ")})`);
  }

  return clauses.length ? `where ${clauses.join(" and ")}` : "";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Converts an API/JSON value into a query parameter for a given column. */
export function toDbParam(value: CellValue | undefined, column: ColumnInfo): unknown {
  if (value === undefined || value === null) return null;
  if (column.kind === "json") return typeof value === "string" ? value : JSON.stringify(value);
  if (column.kind === "array") {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to a friendly error
      }
      throw badRequest(`Column "${column.name}" expects a JSON array such as ["a","b"].`);
    }
  }
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && value === "" && column.kind !== "text") return null;
  return value;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key] = Buffer.isBuffer(value) ? `\\x${value.toString("hex")}` : value;
  }
  return output;
}

async function exec<T extends pg.QueryResultRow>(pool: pg.Pool, sql: string, params: unknown[]) {
  try {
    return await pool.query<T>(sql, params);
  } catch (error) {
    throw translatePgError(error);
  }
}

function assertEditable(meta: TableMeta, needsKey: boolean) {
  if (!meta.editable) throw new AppError(403, "FORBIDDEN", "This relation is read-only (it is a view or you lack write permission).");
  if (needsKey && meta.primaryKey.length === 0) {
    throw new AppError(400, "BAD_REQUEST", "This table has no primary key, so rows cannot be edited or deleted safely.");
  }
}

function keyClause(meta: TableMeta, key: RowValues, params: unknown[]): string {
  const columns = columnMap(meta);
  return meta.primaryKey
    .map((name) => {
      if (!(name in key)) throw badRequest(`Missing primary key value for "${name}".`);
      params.push(toDbParam(key[name], requireColumn(columns, name)));
      return `${quoteIdent(name)} = $${params.length}`;
    })
    .join(" and ");
}

export const tableDataService = {
  async listRows(pool: pg.Pool, meta: TableMeta, query: RowQuery) {
    const params: unknown[] = [];
    const where = buildWhere(meta, query, params);
    const table = qualifiedName(meta.schema, meta.name);

    let orderBy = "";
    if (query.sort) {
      const column = requireColumn(columnMap(meta), query.sort);
      orderBy = `order by ${comparable(column)} ${query.order === "desc" ? "desc" : "asc"} nulls last`;
    } else if (meta.primaryKey.length) {
      orderBy = `order by ${meta.primaryKey.map(quoteIdent).join(", ")}`;
    }

    const offset = (query.page - 1) * query.pageSize;
    const rowsResult = await exec(
      pool,
      `select * from ${table} ${where} ${orderBy} limit ${query.pageSize} offset ${offset}`,
      params,
    );

    // Exact counts can be slow on very large tables; cap the time and fall back to the planner estimate.
    let total: number | null;
    let totalIsEstimate = false;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local statement_timeout = 3000");
      const count = await client.query<{ count: string }>(`select count(*) from ${table} ${where}`, params);
      await client.query("commit");
      total = Number(count.rows[0]?.count ?? 0);
    } catch {
      await client.query("rollback").catch(() => undefined);
      total = where ? null : meta.estimatedRows;
      totalIsEstimate = true;
    } finally {
      client.release();
    }

    return {
      rows: rowsResult.rows.map(serializeRow),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalIsEstimate,
    };
  },

  async insertRow(pool: pg.Pool, meta: TableMeta, values: RowValues) {
    assertEditable(meta, false);
    const columns = columnMap(meta);
    const names = Object.keys(values).filter((name) => !requireColumn(columns, name).isGenerated);
    const params = names.map((name) => toDbParam(values[name], requireColumn(columns, name)));
    const sql = names.length
      ? `insert into ${qualifiedName(meta.schema, meta.name)} (${names.map(quoteIdent).join(", ")}) values (${names
          .map((_, index) => `$${index + 1}`)
          .join(", ")}) returning *`
      : `insert into ${qualifiedName(meta.schema, meta.name)} default values returning *`;
    const result = await exec(pool, sql, params);
    return serializeRow(result.rows[0] ?? {});
  },

  async updateRow(pool: pg.Pool, meta: TableMeta, key: RowValues, values: RowValues) {
    assertEditable(meta, true);
    const columns = columnMap(meta);
    const names = Object.keys(values).filter((name) => !requireColumn(columns, name).isGenerated);
    if (!names.length) throw badRequest("Nothing to update.");
    const params: unknown[] = [];
    const assignments = names.map((name) => {
      params.push(toDbParam(values[name], requireColumn(columns, name)));
      return `${quoteIdent(name)} = $${params.length}`;
    });
    const where = keyClause(meta, key, params);
    const result = await exec(
      pool,
      `update ${qualifiedName(meta.schema, meta.name)} set ${assignments.join(", ")} where ${where} returning *`,
      params,
    );
    if (!result.rowCount) throw notFound("Row not found. It may have been changed or deleted by someone else; refresh and try again.");
    return serializeRow(result.rows[0] ?? {});
  },

  async deleteRows(pool: pg.Pool, meta: TableMeta, keys: RowValues[]) {
    assertEditable(meta, true);
    const client = await pool.connect();
    let deleted = 0;
    try {
      await client.query("begin");
      for (const key of keys) {
        const params: unknown[] = [];
        const where = keyClause(meta, key, params);
        const result = await client.query(`delete from ${qualifiedName(meta.schema, meta.name)} where ${where}`, params);
        deleted += result.rowCount ?? 0;
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw translatePgError(error);
    } finally {
      client.release();
    }
    return { deleted };
  },
};
