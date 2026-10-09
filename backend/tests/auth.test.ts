import express from "express";
import { SignJWT } from "jose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { currentUser, requireAuth } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import {
  createDevVerifier,
  createSupabaseVerifier,
  DEV_TOKEN,
  DEV_USER,
  InvalidTokenError,
} from "../src/services/auth/token-verifier.js";

const SUPABASE_URL = "https://example-project.supabase.co";
const SECRET = "test-secret-with-at-least-32-characters!!";

async function token(claims: Record<string, unknown>, options: { secret?: string; expiresIn?: string; issuer?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("11111111-1111-4111-8111-111111111111")
    .setIssuer(options.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "1h")
    .sign(new TextEncoder().encode(options.secret ?? SECRET));
}

function appWith(verifier = createSupabaseVerifier({ supabaseUrl: SUPABASE_URL, jwtSecret: SECRET })) {
  const app = express();
  app.get("/private", requireAuth({ verifier, syncUser: async () => undefined }), (req, res) => {
    res.json({ user: currentUser(req) });
  });
  app.use(errorHandler);
  return app;
}

describe("requireAuth middleware", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await request(appWith()).get("/private");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects malformed tokens with a friendly message", async () => {
    const response = await request(appWith()).get("/private").set("Authorization", "Bearer not-a-jwt");
    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/session has expired/i);
  });

  it("accepts a valid Supabase access token and exposes the user", async () => {
    const jwt = await token({ role: "authenticated", email: "tapaswi@example.com", user_metadata: { full_name: "Tapaswi Vemuru" } });
    const response = await request(appWith()).get("/private").set("Authorization", `Bearer ${jwt}`);
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: "tapaswi@example.com", displayName: "Tapaswi Vemuru" });
  });

  it("rejects tokens signed with another secret, expired tokens and anon tokens", async () => {
    const forged = await token({ role: "authenticated" }, { secret: "another-secret-with-32-characters-long!" });
    const expired = await token({ role: "authenticated" }, { expiresIn: "-1m" });
    const anon = await token({ role: "anon" });
    const otherIssuer = await token({ role: "authenticated" }, { issuer: "https://evil.example.com/auth/v1" });
    for (const jwt of [forged, expired, anon, otherIssuer]) {
      const response = await request(appWith()).get("/private").set("Authorization", `Bearer ${jwt}`);
      expect(response.status).toBe(401);
    }
  });
});

describe("development verifier", () => {
  it("only accepts the fixed local token", async () => {
    const verify = createDevVerifier();
    await expect(verify(DEV_TOKEN)).resolves.toEqual(DEV_USER);
    await expect(verify("anything-else")).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
