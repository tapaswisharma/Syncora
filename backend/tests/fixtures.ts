import type { ColumnInfo, ColumnKind } from "../src/services/postgres/introspection.service.js";

export function column(name: string, kind: ColumnKind, extra: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    name,
    dataType: kind,
    kind,
    nullable: true,
    defaultValue: null,
    hasDefault: false,
    isPrimaryKey: false,
    isUnique: false,
    isGenerated: false,
    position: 1,
    ...extra,
  };
}

export const customersTable = {
  columns: [
    column("id", "integer", { isPrimaryKey: true, isUnique: true, nullable: false, hasDefault: true }),
    column("name", "text", { nullable: false }),
    column("email", "text", { isUnique: true }),
    column("created_at", "timestamptz", { hasDefault: true }),
    column("settings", "json"),
    column("full_name", "text", { isGenerated: true }),
  ],
};
