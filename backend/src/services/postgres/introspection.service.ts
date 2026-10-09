import type pg from "pg";
import { notFound } from "../../utils/errors.js";
import { translatePgError } from "./pg-errors.js";

export type ColumnKind =
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "timestamp"
  | "timestamptz"
  | "json"
  | "array"
  | "uuid"
  | "text";

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

export function columnKind(typeName: string, category: string): ColumnKind {
  if (category === "A") return "array";
  if (category === "B") return "boolean";
  if (["int2", "int4", "int8"].includes(typeName)) return "integer";
  if (category === "N") return "number";
  if (typeName === "date") return "date";
  if (typeName === "timestamp") return "timestamp";
  if (typeName === "timestamptz") return "timestamptz";
  if (typeName === "json" || typeName === "jsonb") return "json";
  if (typeName === "uuid") return "uuid";
  return "text";
}

const relkindNames: Record<string, TableInfo["type"]> = {
  r: "table",
  p: "partitioned_table",
  v: "view",
  m: "materialized_view",
};

async function run<T extends pg.QueryResultRow>(pool: pg.Pool, sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const result = await pool.query<T>(sql, params);
    return result.rows;
  } catch (error) {
    throw translatePgError(error);
  }
}

export const introspectionService = {
  async listDatabases(pool: pg.Pool): Promise<string[]> {
    const rows = await run<{ datname: string }>(
      pool,
      `select datname from pg_database
        where not datistemplate and datallowconn and has_database_privilege(datname, 'CONNECT')
        order by datname`,
    );
    return rows.map((row) => row.datname);
  },

  async listSchemas(pool: pg.Pool): Promise<Array<{ name: string; tableCount: number }>> {
    const rows = await run<{ name: string; table_count: string }>(
      pool,
      `select n.nspname as name,
              count(c.oid) filter (where c.relkind in ('r','p','v','m')) as table_count
         from pg_namespace n
         left join pg_class c on c.relnamespace = n.oid
        where n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp_%'
          and has_schema_privilege(n.oid, 'USAGE')
        group by n.nspname
        order by (n.nspname = 'public') desc, n.nspname`,
    );
    return rows.map((row) => ({ name: row.name, tableCount: Number(row.table_count) }));
  },

  async listTables(pool: pg.Pool, schema: string): Promise<TableInfo[]> {
    const rows = await run<{ name: string; relkind: string; estimate: string; size: string | null }>(
      pool,
      `select c.relname as name, c.relkind,
              c.reltuples::bigint as estimate,
              case when c.relkind in ('r','p','m') then pg_total_relation_size(c.oid) end as size
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relkind in ('r','p','v','m')
          and has_table_privilege(c.oid, 'SELECT')
        order by c.relname`,
      [schema],
    );
    return rows.map((row) => ({
      schema,
      name: row.name,
      type: relkindNames[row.relkind] ?? "table",
      estimatedRows: Number(row.estimate) >= 0 ? Number(row.estimate) : null,
      sizeBytes: row.size === null ? null : Number(row.size),
    }));
  },

  /** Table metadata, or a 404 if the table does not exist / is not visible. Used to whitelist identifiers. */
  async getTable(pool: pg.Pool, schema: string, table: string): Promise<TableMeta> {
    const [rel] = await run<{ oid: number; relkind: string; estimate: string; size: string | null; can_write: boolean }>(
      pool,
      `select c.oid, c.relkind, c.reltuples::bigint as estimate,
              case when c.relkind in ('r','p','m') then pg_total_relation_size(c.oid) end as size,
              has_table_privilege(c.oid, 'INSERT') or has_table_privilege(c.oid, 'UPDATE') as can_write
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relname = $2 and c.relkind in ('r','p','v','m')`,
      [schema, table],
    );
    if (!rel) throw notFound(`Table "${schema}.${table}" was not found. It may have been renamed or dropped.`);

    const columns = await run<{
      name: string;
      data_type: string;
      typname: string;
      typcategory: string;
      nullable: boolean;
      default_value: string | null;
      identity: string;
      generated: string;
      position: number;
      is_pk: boolean;
      is_unique: boolean;
    }>(
      pool,
      `select a.attname as name,
              format_type(a.atttypid, a.atttypmod) as data_type,
              t.typname, t.typcategory,
              not a.attnotnull as nullable,
              pg_get_expr(d.adbin, d.adrelid) as default_value,
              a.attidentity as identity,
              a.attgenerated as generated,
              a.attnum as position,
              exists (select 1 from pg_constraint k where k.conrelid = a.attrelid and k.contype = 'p' and a.attnum = any(k.conkey)) as is_pk,
              exists (select 1 from pg_index i where i.indrelid = a.attrelid and i.indisunique and i.indnatts = 1 and i.indkey[0] = a.attnum) as is_unique
         from pg_attribute a
         join pg_type t on t.oid = a.atttypid
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped
        order by a.attnum`,
      [rel.oid],
    );

    const mapped: ColumnInfo[] = columns.map((column) => ({
      name: column.name,
      dataType: column.data_type,
      kind: columnKind(column.typname.replace(/^_/, ""), column.typcategory),
      nullable: column.nullable,
      defaultValue: column.default_value,
      hasDefault: column.default_value !== null || column.identity !== "",
      isPrimaryKey: column.is_pk,
      isUnique: column.is_pk || column.is_unique,
      isGenerated: column.generated !== "" || column.identity === "a",
      position: column.position,
    }));
    const primaryKey = mapped.filter((column) => column.isPrimaryKey).map((column) => column.name);
    const type = relkindNames[rel.relkind] ?? "table";
    return {
      schema,
      name: table,
      type,
      estimatedRows: Number(rel.estimate) >= 0 ? Number(rel.estimate) : null,
      sizeBytes: rel.size === null ? null : Number(rel.size),
      columns: mapped,
      primaryKey,
      editable: (type === "table" || type === "partitioned_table") && rel.can_write,
    };
  },
};
