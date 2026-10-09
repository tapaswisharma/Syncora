import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import { googleIntegrations, type GoogleIntegration, type HealthStatus } from "../../db/schema.js";
import { decrypt, encrypt, sign, verifySigned } from "../../utils/crypto.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { logActivity } from "../activity.service.js";
import { translateGoogleError } from "./google-errors.js";

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

const STATE_TTL_MS = 10 * 60 * 1000;

function assertConfigured() {
  if (!env.googleConfigured) {
    throw new AppError(
      503,
      "NOT_CONFIGURED",
      "Google integration is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.",
    );
  }
}

function newClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.googleRedirectUri,
  });
}

async function findIntegration(userId: string): Promise<GoogleIntegration | undefined> {
  const [row] = await getDb().select().from(googleIntegrations).where(eq(googleIntegrations.userId, userId));
  return row;
}

async function recordHealth(userId: string, status: HealthStatus, lastError: string | null) {
  await getDb()
    .update(googleIntegrations)
    .set({ healthStatus: status, lastError, lastCheckedAt: new Date() })
    .where(eq(googleIntegrations.userId, userId));
}

export function toPublicIntegration(integration: GoogleIntegration | undefined) {
  if (!integration) return null;
  return {
    id: integration.id,
    googleEmail: integration.googleEmail,
    scopes: integration.scopes,
    healthStatus: integration.healthStatus,
    lastError: integration.lastError,
    lastCheckedAt: integration.lastCheckedAt,
    connectedAt: integration.createdAt,
    hasRefreshToken: Boolean(integration.refreshTokenEncrypted),
  };
}

export const googleOAuthService = {
  /** URL the browser should open to grant DBSynchro access. `state` binds the callback to this user. */
  createAuthUrl(userId: string): string {
    assertConfigured();
    const state = sign(`${userId}.${Date.now() + STATE_TTL_MS}.${randomBytes(8).toString("hex")}`);
    return newClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state,
    });
  },

  /** Exchanges the authorization code and stores encrypted tokens. Returns the user id from `state`. */
  async handleCallback(code: string, state: string): Promise<string> {
    assertConfigured();
    const payload = verifySigned(state);
    const [userId, expires] = payload?.split(".") ?? [];
    if (!userId || !expires || Number(expires) < Date.now()) {
      throw new AppError(400, "BAD_REQUEST", "The Google sign-in link expired or was tampered with. Please try connecting again.");
    }

    const client = newClient();
    let tokens;
    try {
      ({ tokens } = await client.getToken(code));
    } catch (error) {
      throw translateGoogleError(error, "Google OAuth");
    }

    let googleEmail: string | null = null;
    if (tokens.id_token) {
      try {
        const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
        googleEmail = ticket.getPayload()?.email ?? null;
      } catch (error) {
        logger.warn({ err: error }, "Could not verify Google id_token");
      }
    }

    const existing = await findIntegration(userId);
    const values = {
      googleEmail,
      accessTokenEncrypted: tokens.access_token ? encrypt(tokens.access_token) : null,
      // Google only returns a refresh token on first consent; keep the old one otherwise.
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refreshTokenEncrypted ?? null,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: tokens.scope ? tokens.scope.split(" ") : GOOGLE_SCOPES,
      healthStatus: "CONNECTED" as const,
      lastError: null,
      lastCheckedAt: new Date(),
    };
    await getDb()
      .insert(googleIntegrations)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: googleIntegrations.userId, set: values });

    await logActivity(userId, {
      action: "GOOGLE_CONNECTED",
      entityType: "google",
      entityName: googleEmail ?? "Google account",
      message: `Connected Google account${googleEmail ? ` ${googleEmail}` : ""}`,
    });
    return userId;
  },

  async getIntegration(userId: string) {
    return toPublicIntegration(await findIntegration(userId));
  },

  /** An OAuth client with the user's credentials; refreshed tokens are persisted automatically. */
  async getAuthorizedClient(userId: string): Promise<OAuth2Client> {
    assertConfigured();
    const integration = await findIntegration(userId);
    if (!integration || (!integration.refreshTokenEncrypted && !integration.accessTokenEncrypted)) {
      throw new AppError(400, "GOOGLE_NOT_CONNECTED", "Connect your Google account in Settings to use Google Sheets.");
    }
    const client = newClient();
    client.setCredentials({
      access_token: integration.accessTokenEncrypted ? decrypt(integration.accessTokenEncrypted) : undefined,
      refresh_token: integration.refreshTokenEncrypted ? decrypt(integration.refreshTokenEncrypted) : undefined,
      expiry_date: integration.tokenExpiresAt?.getTime(),
    });
    client.on("tokens", (tokens) => {
      void getDb()
        .update(googleIntegrations)
        .set({
          ...(tokens.access_token ? { accessTokenEncrypted: encrypt(tokens.access_token) } : {}),
          ...(tokens.refresh_token ? { refreshTokenEncrypted: encrypt(tokens.refresh_token) } : {}),
          ...(tokens.expiry_date ? { tokenExpiresAt: new Date(tokens.expiry_date) } : {}),
        })
        .where(eq(googleIntegrations.userId, userId))
        .catch((error: unknown) => logger.warn({ err: error }, "Failed to persist refreshed Google tokens"));
    });
    return client;
  },

  /** Verifies the token and API access for real, then records the result. */
  async checkHealth(userId: string) {
    if (!env.googleConfigured) {
      return { configured: false, connected: false, status: "UNKNOWN" as HealthStatus, checks: [], integration: null };
    }
    const integration = await findIntegration(userId);
    if (!integration) {
      return { configured: true, connected: false, status: "DISCONNECTED" as HealthStatus, checks: [], integration: null };
    }
    const checks: Array<{ name: string; ok: boolean; message: string }> = [];
    let status: HealthStatus = "CONNECTED";
    let lastError: string | null = null;
    try {
      const client = await this.getAuthorizedClient(userId);
      const started = performance.now();
      const { token } = await client.getAccessToken();
      checks.push({ name: "OAuth token", ok: Boolean(token), message: token ? "Valid" : "No access token" });
      const info = await client.getTokenInfo(token!);
      const scopes = info.scopes ?? [];
      const missing = GOOGLE_SCOPES.filter((scope) => scope.startsWith("https://www.googleapis.com/auth/") && !scopes.includes(scope));
      checks.push({
        name: "Permissions",
        ok: missing.length === 0,
        message: missing.length ? `Missing: ${missing.map((scope) => scope.split("/").pop()).join(", ")}` : "All required scopes granted",
      });
      const response = await client.request<{ user?: { emailAddress?: string } }>({
        url: "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
      });
      const latency = Math.round(performance.now() - started);
      checks.push({ name: "Drive API", ok: true, message: `Reachable (${latency} ms)` });
      if (missing.length) {
        status = "DEGRADED";
        lastError = "Some Google permissions are missing. Reconnect and approve all requested access.";
      }
      if (response.data.user?.emailAddress && response.data.user.emailAddress !== integration.googleEmail) {
        await getDb()
          .update(googleIntegrations)
          .set({ googleEmail: response.data.user.emailAddress })
          .where(eq(googleIntegrations.userId, userId));
      }
    } catch (error) {
      const friendly = translateGoogleError(error, "Google");
      status = "DISCONNECTED";
      lastError = friendly.message;
      checks.push({ name: "Google API", ok: false, message: friendly.message });
    }
    await recordHealth(userId, status, lastError);
    await logActivity(userId, {
      action: "GOOGLE_CHECKED",
      status: status === "DISCONNECTED" ? "FAILURE" : "SUCCESS",
      entityType: "google",
      entityName: integration.googleEmail ?? "Google account",
      message: status === "DISCONNECTED" ? `Google health check failed: ${lastError}` : "Google connection verified",
    });
    return {
      configured: true,
      connected: true,
      status,
      checks,
      integration: toPublicIntegration(await findIntegration(userId)),
    };
  },

  async disconnect(userId: string) {
    const integration = await findIntegration(userId);
    if (!integration) return;
    const token = integration.refreshTokenEncrypted ?? integration.accessTokenEncrypted;
    if (token && env.googleConfigured) {
      await newClient()
        .revokeToken(decrypt(token))
        .catch((error: unknown) => logger.info({ err: error }, "Google token revoke failed (token may already be invalid)"));
    }
    await getDb().delete(googleIntegrations).where(eq(googleIntegrations.userId, userId));
    await logActivity(userId, {
      action: "GOOGLE_DISCONNECTED",
      entityType: "google",
      entityName: integration.googleEmail ?? "Google account",
      message: "Disconnected Google account",
    });
  },
};
