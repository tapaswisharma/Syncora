import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import {
  createDevVerifier,
  createSupabaseVerifier,
  InvalidTokenError,
  type AuthenticatedUser,
  type TokenVerifier,
} from "../services/auth/token-verifier.js";
import { ensureUser } from "../services/auth/user.service.js";
import { AppError } from "../utils/errors.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export function defaultVerifier(): TokenVerifier {
  return env.authMode === "supabase"
    ? createSupabaseVerifier({ supabaseUrl: env.SUPABASE_URL!, jwtSecret: env.SUPABASE_JWT_SECRET })
    : createDevVerifier();
}

interface AuthOptions {
  verifier?: TokenVerifier;
  /** Persist/refresh the user row. Disabled in unit tests. */
  syncUser?: (user: AuthenticatedUser) => Promise<void>;
}

/** Rejects requests without a valid Supabase (or local development) bearer token. */
export function requireAuth(options: AuthOptions = {}) {
  const verifier = options.verifier ?? defaultVerifier();
  const syncUser = options.syncUser ?? ensureUser;

  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return next(new AppError(401, "UNAUTHORIZED", "You need to sign in to continue."));
    }
    try {
      const user = await verifier(token);
      await syncUser(user);
      req.user = user;
      next();
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        return next(new AppError(401, "UNAUTHORIZED", "Your session has expired. Please sign in again."));
      }
      next(error);
    }
  };
}

export function currentUser(req: Request): AuthenticatedUser {
  if (!req.user) throw new AppError(401, "UNAUTHORIZED", "You need to sign in to continue.");
  return req.user;
}
