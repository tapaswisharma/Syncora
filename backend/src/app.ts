import cors from "cors";
import express, { type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { buildRouter } from "./routes/index.js";
import { logger } from "./utils/logger.js";

export function createApp(options: { auth?: RequestHandler } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser requests and configured frontends only.
        if (!origin || env.corsOrigins.includes(origin.replace(/\/$/, ""))) return callback(null, true);
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  if (!env.isTest) {
    app.use(
      "/api",
      rateLimit({
        windowMs: 60_000,
        limit: 300,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again in a minute." } },
      }),
    );
  }

  app.get("/", (_req, res) => {
    res.json({ name: "DBSynchro API", docs: "See README.md", health: "/api/health" });
  });
  app.use("/api", buildRouter({ auth: options.auth }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
