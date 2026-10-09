import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

export class InvalidTokenError extends Error {
  constructor(message = "Invalid or expired session") {
    super(message);
    this.name = "InvalidTokenError";
  }
}

/** Fixed identity used only in local development mode (no Supabase configured). */
export const DEV_TOKEN = "dev-local-token";
export const DEV_USER: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "developer@localhost",
  displayName: "Local Developer",
  avatarUrl: null,
};

function toUser(payload: JWTPayload): AuthenticatedUser {
  const metadata = (payload.user_metadata ?? {}) as Record<string, unknown>;
  if (!payload.sub) throw new InvalidTokenError("Session token has no subject");
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === "string" && value) return value;
    }
    return null;
  };
  return {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
    displayName: pick("full_name", "name"),
    avatarUrl: pick("avatar_url", "picture"),
  };
}

/**
 * Verifies Supabase access tokens locally.
 * - With a JWT secret: HS256 (legacy Supabase projects).
 * - Otherwise: asymmetric keys from the project's JWKS endpoint (current Supabase default).
 */
export function createSupabaseVerifier(options: { supabaseUrl: string; jwtSecret?: string }): TokenVerifier {
  const issuer = `${options.supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  const secret = options.jwtSecret ? new TextEncoder().encode(options.jwtSecret) : undefined;
  const jwks = secret ? undefined : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async (token) => {
    try {
      const verifyOptions = { issuer, audience: "authenticated" };
      const { payload } = secret
        ? await jwtVerify(token, secret, verifyOptions)
        : await jwtVerify(token, jwks!, verifyOptions);
      if (payload.role !== "authenticated") throw new InvalidTokenError("Session is not an authenticated user session");
      return toUser(payload);
    } catch (error) {
      if (error instanceof InvalidTokenError) throw error;
      throw new InvalidTokenError();
    }
  };
}

export function createDevVerifier(): TokenVerifier {
  return async (token) => {
    if (token !== DEV_TOKEN) throw new InvalidTokenError();
    return DEV_USER;
  };
}
