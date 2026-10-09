import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { currentUser } from "../middleware/auth.js";
import { googleOAuthService } from "../services/google/oauth.service.js";
import { sheetsService } from "../services/google/sheets.service.js";
import { suggestMappings } from "../services/sync/mapping.service.js";
import { AppError, errorMessage } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { parse } from "../utils/validation.js";

const spreadsheetParams = z.object({ spreadsheetId: z.string().min(10).max(200).regex(/^[a-zA-Z0-9_-]+$/, "Invalid spreadsheet id") });

export const googleController = {
  async status(req: Request, res: Response) {
    res.json({ configured: env.googleConfigured, integration: await googleOAuthService.getIntegration(currentUser(req).id) });
  },
  async checkHealth(req: Request, res: Response) {
    res.json(await googleOAuthService.checkHealth(currentUser(req).id));
  },
  authUrl(req: Request, res: Response) {
    res.json({ url: googleOAuthService.createAuthUrl(currentUser(req).id) });
  },
  /** Browser redirect target from Google. Always ends with a redirect back to the frontend. */
  async callback(req: Request, res: Response) {
    const target = new URL("/settings", env.FRONTEND_URL);
    const { code, state, error } = req.query as Record<string, string | undefined>;
    try {
      if (error) throw new AppError(400, "BAD_REQUEST", error === "access_denied" ? "Google access was not granted." : `Google returned an error: ${error}`);
      if (!code || !state) throw new AppError(400, "BAD_REQUEST", "Google did not return an authorization code.");
      await googleOAuthService.handleCallback(code, state);
      target.searchParams.set("google", "connected");
    } catch (caught) {
      logger.warn({ err: caught }, "Google OAuth callback failed");
      target.searchParams.set("google", "error");
      target.searchParams.set("reason", caught instanceof AppError ? caught.message : "Google sign-in failed. Please try again.");
      if (!(caught instanceof AppError)) logger.error({ detail: errorMessage(caught) }, "Unexpected OAuth failure");
    }
    res.redirect(302, target.toString());
  },
  async disconnect(req: Request, res: Response) {
    await googleOAuthService.disconnect(currentUser(req).id);
    res.status(204).end();
  },
  async spreadsheets(req: Request, res: Response) {
    const query = parse(z.object({ search: z.string().max(100).optional(), pageToken: z.string().max(500).optional() }), req.query, "query");
    res.json(await sheetsService.listSpreadsheets(currentUser(req).id, query));
  },
  async spreadsheet(req: Request, res: Response) {
    const { spreadsheetId } = parse(spreadsheetParams, req.params);
    res.json({ spreadsheet: await sheetsService.getSpreadsheet(currentUser(req).id, spreadsheetId) });
  },
  async preview(req: Request, res: Response) {
    const { spreadsheetId, sheetId } = parse(spreadsheetParams.extend({ sheetId: z.coerce.number().int().min(0) }), req.params);
    const { limit, pgColumns } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(200).default(20), pgColumns: z.string().max(5000).optional() }),
      req.query,
      "query",
    );
    const userId = currentUser(req).id;
    const worksheet = await sheetsService.getWorksheet(userId, spreadsheetId, sheetId);
    const data = await sheetsService.readWorksheet(userId, spreadsheetId, worksheet.title, limit);
    res.json({
      worksheet,
      headers: data.headers,
      rows: data.rows.map((row) => row.values),
      suggestedMappings: pgColumns ? suggestMappings(pgColumns.split(","), data.headers) : [],
    });
  },
};
