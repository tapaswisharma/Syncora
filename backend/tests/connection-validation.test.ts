import { describe, expect, it } from "vitest";
import { createConnectionSchema, updateConnectionSchema } from "../src/schemas/connection.schema.js";
import { toPublicConnection } from "../src/services/postgres/connection.service.js";
import { translatePgError } from "../src/services/postgres/pg-errors.js";
import { decrypt, encrypt } from "../src/utils/crypto.js";

const valid = {
  name: "Production",
  host: "db.example.supabase.co",
  port: 5432,
  database: "postgres",
  username: "postgres",
  password: "s3cret",
  sslMode: "require",
};

describe("connection validation", () => {
  it("accepts a complete connection", () => {
    expect(createConnectionSchema.safeParse(valid).success).toBe(true);
  });

  it("coerces a string port and rejects out-of-range ports", () => {
    expect(createConnectionSchema.parse({ ...valid, port: "6543" }).port).toBe(6543);
    expect(createConnectionSchema.safeParse({ ...valid, port: 70000 }).success).toBe(false);
  });

  it("requires a password on create but not on update", () => {
    expect(createConnectionSchema.safeParse({ ...valid, password: "" }).success).toBe(false);
    expect(updateConnectionSchema.safeParse({ name: "Renamed" }).success).toBe(true);
  });

  it("rejects hosts containing URL or shell syntax", () => {
    for (const host of ["db.example.com/path", "db example", "host;rm -rf", "user@host"]) {
      expect(createConnectionSchema.safeParse({ ...valid, host }).success).toBe(false);
    }
  });

  it("rejects unknown SSL modes", () => {
    expect(createConnectionSchema.safeParse({ ...valid, sslMode: "prefer" }).success).toBe(false);
  });
});

describe("connection secrets", () => {
  it("encrypts passwords reversibly and never returns them from the API shape", () => {
    const encrypted = encrypt("s3cret");
    expect(encrypted).not.toContain("s3cret");
    expect(decrypt(encrypted)).toBe("s3cret");
    const shaped = toPublicConnection({
      id: "1",
      userId: "u",
      name: "x",
      host: "h",
      port: 5432,
      database: "d",
      username: "u",
      passwordEncrypted: encrypted,
      sslMode: "require",
      healthStatus: "UNKNOWN",
      lastLatencyMs: null,
      lastError: null,
      lastCheckedAt: null,
      serverVersion: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(JSON.stringify(shaped)).not.toContain(encrypted);
    expect(shaped).not.toHaveProperty("passwordEncrypted");
  });

  it("translates driver errors into actionable messages", () => {
    expect(translatePgError({ code: "28P01" }, "connect").message).toMatch(/username or password/);
    expect(translatePgError({ code: "ECONNREFUSED" }, "connect").message).toMatch(/refused/);
    expect(translatePgError({ code: "23505", constraint: "users_email_key" }).status).toBe(409);
    expect(translatePgError(new Error("weird"), "connect").message).toMatch(/Unable to connect to PostgreSQL/);
  });
});
