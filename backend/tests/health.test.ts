import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /api/health", () => {
  it("reports service status without requiring authentication", async () => {
    const response = await request(createApp()).get("/api/health");
    expect([200, 503]).toContain(response.status);
    expect(response.body.service).toBe("dbsynchro-api");
    expect(response.body.checks.auth.mode).toBeDefined();
    expect(response.body.checks.google).toHaveProperty("configured");
  });

  it("returns a friendly JSON 404 for unknown routes", async () => {
    const response = await request(createApp()).get("/api/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("exposes only non-secret public configuration", async () => {
    const response = await request(createApp()).get("/api/config");
    expect(response.status).toBe(200);
    const text = JSON.stringify(response.body).toLowerCase();
    expect(text).not.toContain("secret\":\"");
    expect(response.body).toHaveProperty("authMode");
  });
});
