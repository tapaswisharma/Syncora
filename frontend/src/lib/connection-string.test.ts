import { describe, expect, it } from "vitest";
import { parseConnectionString } from "./connection-string";

describe("parseConnectionString", () => {
  it("parses a Supabase-style URL", () => {
    expect(parseConnectionString("postgresql://postgres.abc:p%40ss@aws-0-eu.pooler.supabase.com:5432/postgres")).toEqual({
      host: "aws-0-eu.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      username: "postgres.abc",
      password: "p@ss",
      sslMode: "require",
    });
  });
  it("honours sslmode=disable and rejects other schemes", () => {
    expect(parseConnectionString("postgres://u:p@localhost/db?sslmode=disable")?.sslMode).toBe("disable");
    expect(parseConnectionString("mysql://u:p@localhost/db")).toBeNull();
  });
});
