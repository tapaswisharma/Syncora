import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth.js";
import { createConnectionSchema, testConnectionSchema, updateConnectionSchema } from "../schemas/connection.schema.js";
import { idParamSchema } from "../schemas/common.schema.js";
import { connectionService } from "../services/postgres/connection.service.js";
import { parse } from "../utils/validation.js";

export const connectionsController = {
  async list(req: Request, res: Response) {
    res.json({ connections: await connectionService.list(currentUser(req).id) });
  },
  async get(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    res.json({ connection: await connectionService.get(currentUser(req).id, id) });
  },
  async create(req: Request, res: Response) {
    const input = parse(createConnectionSchema, req.body, "connection");
    res.status(201).json({ connection: await connectionService.create(currentUser(req).id, input) });
  },
  async update(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    const input = parse(updateConnectionSchema, req.body, "connection");
    res.json({ connection: await connectionService.update(currentUser(req).id, id, input) });
  },
  async remove(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    await connectionService.remove(currentUser(req).id, id);
    res.status(204).end();
  },
  async test(req: Request, res: Response) {
    const { id } = parse(idParamSchema, req.params);
    res.json({ result: await connectionService.test(currentUser(req).id, id) });
  },
  async testUnsaved(req: Request, res: Response) {
    const input = parse(testConnectionSchema, req.body, "connection");
    res.json({ result: await connectionService.testUnsaved(currentUser(req).id, input) });
  },
};
