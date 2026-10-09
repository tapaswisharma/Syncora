import type { Request, Response } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth.js";
import { idParamSchema, paginationQuerySchema } from "../schemas/common.schema.js";
import { runSyncSchema, syncConfigSchema, updateSyncConfigSchema, validateSyncSchema } from "../schemas/sync.schema.js";
import { listActivity } from "../services/activity.service.js";
import { dashboardService } from "../services/dashboard.service.js";
import { conflictService } from "../services/sync/conflict.service.js";
import { syncRunService } from "../services/sync/sync-run.service.js";
import { syncService } from "../services/sync/sync.service.js";
import { parse } from "../utils/validation.js";

const runStatus = z.enum(["RUNNING", "SUCCESS", "PARTIAL", "FAILED"]);

export const syncController = {
  async list(req: Request, res: Response) {
    res.json({ syncs: await syncService.list(currentUser(req).id) });
  },
  async get(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    res.json({ sync: await syncService.get(currentUser(req).id, id) });
  },
  async create(req: Request, res: Response) {
    const input = parse(syncConfigSchema, req.body, "sync configuration");
    res.status(201).json({ sync: await syncService.create(currentUser(req).id, input) });
  },
  async validate(req: Request, res: Response) {
    const input = parse(validateSyncSchema, req.body, "sync configuration");
    res.json({ validation: await syncService.validate(currentUser(req).id, input) });
  },
  async update(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    const input = parse(updateSyncConfigSchema, req.body, "sync configuration");
    res.json({ sync: await syncService.update(currentUser(req).id, id, input) });
  },
  async remove(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    await syncService.remove(currentUser(req).id, id);
    res.status(204).end();
  },
  async preview(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    res.json({ preview: await syncService.preview(currentUser(req).id, id) });
  },
  async run(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    const { confirmDeletes } = parse(runSyncSchema, req.body ?? {});
    res.status(202).json({ run: await syncService.startRun(currentUser(req).id, id, { confirmDeletes }) });
  },
  async runDetail(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    res.json({ run: await syncRunService.get(currentUser(req).id, id) });
  },
  async history(req: Request, res: Response) {
    const query = parse(paginationQuerySchema.extend({ syncId: z.uuid().optional(), status: runStatus.optional() }), {
      ...req.query,
      syncId: req.params.id ?? req.query.syncId,
    });
    res.json(await syncRunService.history(currentUser(req).id, query));
  },
  async conflicts(req: Request, res: Response) {
    const query = parse(
      z.object({ status: z.enum(["OPEN", "RESOLVED"]).optional(), syncId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }),
      req.query,
      "query",
    );
    res.json({ conflicts: await conflictService.list(currentUser(req).id, query) });
  },
  async resolveConflict(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    const { choice } = parse(z.object({ choice: z.enum(["POSTGRES", "SHEETS", "DISMISS"]) }), req.body);
    res.json(await conflictService.resolve(currentUser(req).id, id, choice));
  },
  async activity(req: Request, res: Response) {
    const { limit, before } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.coerce.date().optional() }),
      req.query,
      "query",
    );
    res.json(await listActivity(currentUser(req).id, { limit, before }));
  },
  async dashboard(req: Request, res: Response) {
    res.json(await dashboardService.summary(currentUser(req).id));
  },
};
