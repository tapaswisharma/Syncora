import { Router, type RequestHandler } from "express";
import { env } from "../config/env.js";
import { connectionsController } from "../controllers/connections.controller.js";
import { googleController } from "../controllers/google.controller.js";
import { health, publicConfig } from "../controllers/system.controller.js";
import { syncController } from "../controllers/sync.controller.js";
import { tablesController } from "../controllers/tables.controller.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";

const requireDatabase: RequestHandler = (_req, _res, next) => {
  if (!env.databaseConfigured) {
    return next(
      new AppError(503, "NOT_CONFIGURED", "The DBSynchro metadata database is not configured. Set DATABASE_URL in backend/.env and run `npm run db:migrate`."),
    );
  }
  next();
};

export function buildRouter(options: { auth?: RequestHandler } = {}) {
  const router = Router();

  router.get("/health", health);
  router.get("/config", publicConfig);
  router.get("/google/callback", requireDatabase, googleController.callback);

  const auth = options.auth ?? requireAuth();
  // Guards are attached per route so unknown paths still get a 404 instead of a 401.
  const guard = [requireDatabase, auth];

  router.get("/auth/me", ...guard, (req, res) => {
    res.json({ user: currentUser(req), authMode: env.authMode });
  });
  router.get("/dashboard", ...guard, syncController.dashboard);

  router.get("/connections", ...guard, connectionsController.list);
  router.post("/connections", ...guard, connectionsController.create);
  router.post("/connections/test", ...guard, connectionsController.testUnsaved);
  router.get("/connections/:id", ...guard, connectionsController.get);
  router.patch("/connections/:id", ...guard, connectionsController.update);
  router.delete("/connections/:id", ...guard, connectionsController.remove);
  router.post("/connections/:id/test", ...guard, connectionsController.test);

  router.get("/connections/:id/databases", ...guard, tablesController.databases);
  router.get("/connections/:id/schemas", ...guard, tablesController.schemas);
  router.get("/connections/:id/tables", ...guard, tablesController.tables);
  router.get("/connections/:id/tables/:schema/:table", ...guard, tablesController.table);
  router.get("/connections/:id/tables/:schema/:table/rows", ...guard, tablesController.rows);
  router.post("/connections/:id/tables/:schema/:table/rows", ...guard, tablesController.insertRow);
  router.patch("/connections/:id/tables/:schema/:table/rows", ...guard, tablesController.updateRow);
  router.delete("/connections/:id/tables/:schema/:table/rows", ...guard, tablesController.deleteRows);

  router.get("/google/status", ...guard, googleController.status);
  router.post("/google/health", ...guard, googleController.checkHealth);
  router.get("/google/auth-url", ...guard, googleController.authUrl);
  router.delete("/google", ...guard, googleController.disconnect);
  router.get("/google/spreadsheets", ...guard, googleController.spreadsheets);
  router.get("/google/spreadsheets/:spreadsheetId", ...guard, googleController.spreadsheet);
  router.get("/google/spreadsheets/:spreadsheetId/sheets/:sheetId/preview", ...guard, googleController.preview);

  router.get("/sync", ...guard, syncController.list);
  router.post("/sync", ...guard, syncController.create);
  router.post("/sync/validate", ...guard, syncController.validate);
  router.get("/sync/runs/:id", ...guard, syncController.runDetail);
  router.get("/sync/:id", ...guard, syncController.get);
  router.patch("/sync/:id", ...guard, syncController.update);
  router.delete("/sync/:id", ...guard, syncController.remove);
  router.post("/sync/:id/preview", ...guard, syncController.preview);
  router.post("/sync/:id/run", ...guard, syncController.run);
  router.get("/sync/:id/history", ...guard, syncController.history);

  router.get("/history", ...guard, syncController.history);
  router.get("/conflicts", ...guard, syncController.conflicts);
  router.post("/conflicts/:id/resolve", ...guard, syncController.resolveConflict);
  router.get("/activity", ...guard, syncController.activity);

  return router;
}
