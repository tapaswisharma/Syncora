import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth.js";
import {
  databaseQuerySchema,
  deleteRowsSchema,
  idParamSchema,
  insertRowSchema,
  rowQuerySchema,
  tableParamsSchema,
  updateRowSchema,
} from "../schemas/common.schema.js";
import { z } from "zod";
import { logActivity } from "../services/activity.service.js";
import { connectionService } from "../services/postgres/connection.service.js";
import { introspectionService } from "../services/postgres/introspection.service.js";
import { tableDataService } from "../services/postgres/table-data.service.js";
import { parse } from "../utils/validation.js";

async function tableContext(req: Request) {
  const userId = currentUser(req).id;
  const { id, schema, table } = parse(tableParamsSchema, req.params);
  const { database } = parse(databaseQuerySchema, { database: req.query.database });
  const pool = await connectionService.poolFor(userId, id, database);
  const meta = await introspectionService.getTable(pool, schema, table);
  return { userId, pool, meta };
}

export const tablesController = {
  async databases(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    const pool = await connectionService.poolFor(currentUser(req).id, id);
    res.json({ databases: await introspectionService.listDatabases(pool) });
  },
  async schemas(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    const { database } = parse(databaseQuerySchema, req.query);
    const pool = await connectionService.poolFor(currentUser(req).id, id, database);
    res.json({ schemas: await introspectionService.listSchemas(pool) });
  },
  async tables(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    const { database, schema } = parse(databaseQuerySchema.extend({ schema: z.string().min(1).max(63).default("public") }), req.query);
    const pool = await connectionService.poolFor(currentUser(req).id, id, database);
    res.json({ tables: await introspectionService.listTables(pool, schema) });
  },
  async table(req: Request, res: Response) {
    const { meta } = await tableContext(req);
    res.json({ table: meta });
  },
  async rows(req: Request, res: Response) {
    const { pool, meta } = await tableContext(req);
    const query = parse(rowQuerySchema, req.query, "query");
    res.json(await tableDataService.listRows(pool, meta, query));
  },
  async insertRow(req: Request, res: Response) {
    const { pool, meta } = await tableContext(req);
    const { values } = parse(insertRowSchema, req.body, "row");
    res.status(201).json({ row: await tableDataService.insertRow(pool, meta, values) });
  },
  async updateRow(req: Request, res: Response) {
    const { pool, meta } = await tableContext(req);
    const { key, values } = parse(updateRowSchema, req.body, "row");
    res.json({ row: await tableDataService.updateRow(pool, meta, key, values) });
  },
  async deleteRows(req: Request, res: Response) {
    const { userId, pool, meta } = await tableContext(req);
    const { keys } = parse(deleteRowsSchema, req.body, "request");
    const result = await tableDataService.deleteRows(pool, meta, keys);
    await logActivity(userId, {
      action: "ROWS_DELETED",
      entityType: "table",
      entityName: `${meta.schema}.${meta.name}`,
      message: `Deleted ${result.deleted} row(s) from ${meta.schema}.${meta.name}`,
    });
    res.json(result);
  },
};
