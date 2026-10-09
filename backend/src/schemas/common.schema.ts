import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid("Invalid id") });

export const databaseQuerySchema = z.object({
  database: z.string().min(1).max(63).optional(),
});

export const tableParamsSchema = z.object({
  id: z.uuid("Invalid connection id"),
  schema: z.string().min(1).max(63),
  table: z.string().min(1).max(63),
});

const cellValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string(), z.unknown()), z.array(z.unknown())]);
export const rowValuesSchema = z.record(z.string(), cellValue);

export const rowQuerySchema = z.object({
  database: z.string().min(1).max(63).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().max(63).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().max(200).optional(),
  filters: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return [];
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "filters must be JSON" });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(
          z.object({
            column: z.string().min(1).max(63),
            op: z.enum(["eq", "neq", "contains", "starts_with", "gt", "gte", "lt", "lte", "is_null", "not_null"]),
            value: z.string().max(500).optional(),
          }),
        )
        .max(10),
    ),
});

export const insertRowSchema = z.object({ values: rowValuesSchema });
export const updateRowSchema = z.object({ key: rowValuesSchema, values: rowValuesSchema });
export const deleteRowsSchema = z.object({ keys: z.array(rowValuesSchema).min(1).max(500) });

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
