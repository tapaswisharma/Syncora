import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

const DEV_FALLBACK_SECRET = "dbsynchro-local-development-key-do-not-use-in-production";

function resolveKey(): Buffer {
  const configured = env.ENCRYPTION_KEY;
  if (!configured) {
    if (!env.isTest) {
      logger.warn("ENCRYPTION_KEY is not set; using an insecure development key. Never do this in production.");
    }
    return createHash("sha256").update(DEV_FALLBACK_SECRET).digest();
  }
  const fromBase64 = Buffer.from(configured, "base64");
  if (fromBase64.length === 32) return fromBase64;
  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
  // Accept any other string by hashing it, so a passphrase still yields a 256-bit key.
  return createHash("sha256").update(configured).digest();
}

const key = resolveKey();
const VERSION = "v1";

/** AES-256-GCM. Output format: v1.<iv>.<tag>.<ciphertext> (base64url parts). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unsupported encrypted payload format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/** Signs a short payload (used for the Google OAuth `state` parameter). */
export function sign(value: string): string {
  const signature = createHmac("sha256", key).update(value).digest("base64url");
  return `${value}.${signature}`;
}

export function verifySigned(signed: string): string | null {
  const index = signed.lastIndexOf(".");
  if (index <= 0) return null;
  const value = signed.slice(0, index);
  const expected = Buffer.from(sign(value).slice(index + 1));
  const actual = Buffer.from(signed.slice(index + 1));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return value;
}

export function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}
