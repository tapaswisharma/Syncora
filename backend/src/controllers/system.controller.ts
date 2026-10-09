import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { pingDb } from "../db/client.js";

const startedAt = new Date();

export async function health(_req: Request, res: Response) {
  const database = env.databaseConfigured ? await pingDb() : { ok: false, error: "DATABASE_URL is not set" };
  res.status(database.ok || !env.databaseConfigured ? 200 : 503).json({
    status: database.ok ? "ok" : env.databaseConfigured ? "degraded" : "setup_required",
    service: "dbsynchro-api",
    version: "1.0.0",
    time: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    checks: {
      database: { configured: env.databaseConfigured, ...database },
      auth: { mode: env.authMode },
      google: { configured: env.googleConfigured },
    },
  });
}

/** Public, non-secret configuration the frontend uses to show setup states. */
export function publicConfig(_req: Request, res: Response) {
  res.json({
    authMode: env.authMode,
    databaseConfigured: env.databaseConfigured,
    googleConfigured: env.googleConfigured,
    encryptionKeyConfigured: Boolean(env.ENCRYPTION_KEY),
    environment: env.NODE_ENV,
  });
}
