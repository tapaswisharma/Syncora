/**
 * End-to-end sync against a real PostgreSQL with an in-memory fake of the Google Sheets service.
 * Runs only when DATABASE_URL (metadata DB, migrated) and TEST_TARGET_DATABASE_URL are set, e.g.:
 *   TEST_TARGET_DATABASE_URL=postgres://postgres:postgres@localhost:5432/demo npm test
 */
import "dotenv/config";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const target = process.env.TEST_TARGET_DATABASE_URL;
const enabled = Boolean(process.env.DATABASE_URL && target);

type Cell = string | number | boolean;

describe.skipIf(!enabled)("sync engine (integration)", async () => {
  const { sheetsService } = await import("../src/services/google/sheets.service.js");
  const { connectionService } = await import("../src/services/postgres/connection.service.js");
  const { syncService } = await import("../src/services/sync/sync.service.js");
  const { syncRunService } = await import("../src/services/sync/sync-run.service.js");
  const { conflictService } = await import("../src/services/sync/conflict.service.js");
  const { ensureUser } = await import("../src/services/auth/user.service.js");
  const { DEV_USER } = await import("../src/services/auth/token-verifier.js");

  const userId = DEV_USER.id;
  const sheet: { headers: string[]; rows: Cell[][] } = { headers: [], rows: [] };
  const targetClient = new pg.Client({ connectionString: target });
  let connectionId = "";
  let syncId = "";

  const pad = (row: Cell[]) => row;
  vi.spyOn(sheetsService, "getWorksheet").mockImplementation(async () => ({ id: 0, title: "Sheet1", index: 0, rowCount: 1000, columnCount: 26 }));
  vi.spyOn(sheetsService, "getModifiedTime").mockImplementation(async () => new Date());
  vi.spyOn(sheetsService, "readWorksheet").mockImplementation(async (_u, _s, _t, limit) => ({
    headers: [...sheet.headers],
    rows: sheet.rows.slice(0, limit ?? sheet.rows.length).map((values, index) => ({ rowNumber: index + 2, values: [...values] })),
  }));
  vi.spyOn(sheetsService, "writeHeaders").mockImplementation(async (_u, _s, _t, headers) => {
    sheet.headers = [...headers];
  });
  vi.spyOn(sheetsService, "updateRows").mockImplementation(async (_u, _s, _t, updates) => {
    for (const update of updates) sheet.rows[update.rowNumber - 2] = pad([...update.values]);
  });
  vi.spyOn(sheetsService, "appendRows").mockImplementation(async (_u, _s, _t, rows) => {
    sheet.rows.push(...rows.map((row) => [...row]));
  });
  vi.spyOn(sheetsService, "deleteRows").mockImplementation(async (_u, _s, _w, rowNumbers) => {
    for (const rowNumber of [...rowNumbers].sort((a, b) => b - a)) sheet.rows.splice(rowNumber - 2, 1);
  });

  async function runSync(confirmDeletes = false) {
    const run = await syncService.startRun(userId, syncId, { confirmDeletes });
    for (let i = 0; i < 100; i++) {
      const current = await syncRunService.get(userId, run.id);
      if (current.status !== "RUNNING") return current;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("sync did not finish");
  }

  const pgRows = async () =>
    (await targetClient.query("select id, name, score, active from public.dbsynchro_it order by id")).rows as Array<{ id: number; name: string; score: string | null; active: boolean }>;
  const sheetById = (id: number) => sheet.rows.find((row) => row[0] === id);

  beforeAll(async () => {
    await targetClient.connect();
    await targetClient.query("drop table if exists public.dbsynchro_it");
    await targetClient.query(
      "create table public.dbsynchro_it (id serial primary key, name text not null, score numeric(6,2), active boolean not null default true)",
    );
    await targetClient.query("insert into public.dbsynchro_it (name, score, active) values ('Ada', 10.5, true), ('Grace', 20, false), ('Alan', null, true)");
    await ensureUser(DEV_USER);
    const url = new URL(target!);
    const connection = await connectionService.create(userId, {
      name: `integration-${Date.now()}`,
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.slice(1),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password) || "unused",
      sslMode: "disable",
    });
    connectionId = connection.id;
    const sync = await syncService.create(userId, {
      name: "Integration sync",
      connectionId,
      schemaName: "public",
      tableName: "dbsynchro_it",
      keyColumn: "id",
      spreadsheetId: "fake-spreadsheet-id",
      spreadsheetName: "Fake",
      worksheetId: 0,
      worksheetTitle: "Sheet1",
      direction: "BIDIRECTIONAL",
      conflictStrategy: "POSTGRES_WINS",
      deleteMode: "CONFIRM",
      enabled: true,
      mappings: [
        { pgColumn: "id", sheetColumn: "ID" },
        { pgColumn: "name", sheetColumn: "Name" },
        { pgColumn: "score", sheetColumn: "Score" },
        { pgColumn: "active", sheetColumn: "Active" },
      ],
    });
    syncId = sync.id;
  });

  afterAll(async () => {
    if (connectionId) await connectionService.remove(userId, connectionId).catch(() => undefined);
    await targetClient.query("drop table if exists public.dbsynchro_it").catch(() => undefined);
    await targetClient.end();
  });

  it("populates an empty worksheet with headers and typed rows", async () => {
    const run = await runSync();
    expect(run.status).toBe("SUCCESS");
    expect(sheet.headers).toEqual(["ID", "Name", "Score", "Active"]);
    expect(sheet.rows).toEqual([
      [1, "Ada", 10.5, true],
      [2, "Grace", 20, false],
      [3, "Alan", "", true],
    ]);
    expect(run.rowsInserted).toBe(3);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const run = await runSync();
    expect(run.status).toBe("SUCCESS");
    expect(run.rowsInserted + run.rowsUpdated + run.rowsDeleted).toBe(0);
  });

  it("syncs edits both ways and inserts rows typed into the sheet without an id", async () => {
    sheetById(1)![1] = "Ada Lovelace";
    sheet.rows.push(["", "Katherine", 7, true]);
    await targetClient.query("update public.dbsynchro_it set score = 99 where id = 3");
    const run = await runSync();
    expect(run.status).toBe("SUCCESS");
    const rows = await pgRows();
    expect(rows.find((r) => r.id === 1)?.name).toBe("Ada Lovelace");
    const katherine = rows.find((r) => r.name === "Katherine");
    expect(katherine).toBeDefined();
    expect(sheet.rows[3]?.[0]).toBe(katherine!.id);
    expect(sheetById(3)?.[2]).toBe(99);
  });

  it("holds deletions until they are confirmed", async () => {
    await targetClient.query("delete from public.dbsynchro_it where id = 2");
    const unconfirmed = await runSync(false);
    expect(unconfirmed.details?.skippedDeletes).toBe(1);
    expect(sheetById(2)).toBeDefined();
    const confirmed = await runSync(true);
    expect(confirmed.rowsDeleted).toBe(1);
    expect(sheetById(2)).toBeUndefined();
  });

  it("records conflicts and applies the configured strategy", async () => {
    sheetById(1)![1] = "Sheet edit";
    await targetClient.query("update public.dbsynchro_it set name = 'Database edit' where id = 1");
    const run = await runSync();
    expect(run.conflictsCount).toBe(1);
    expect(sheetById(1)?.[1]).toBe("Database edit");
    const conflicts = await conflictService.list(userId, { syncId, limit: 10 });
    expect(conflicts[0]).toMatchObject({ rowKey: "1", type: "UPDATE_UPDATE", status: "RESOLVED_AUTO", resolution: "POSTGRES" });
  });

  it("reports bad values as row errors without failing the whole run", async () => {
    sheetById(3)![2] = "not a number";
    sheetById(1)![1] = "Fine edit";
    const run = await runSync();
    expect(run.status).toBe("PARTIAL");
    expect(run.errors.join(" ")).toMatch(/wrong format/);
    expect((await pgRows()).find((r) => r.id === 1)?.name).toBe("Fine edit");
  });
});
