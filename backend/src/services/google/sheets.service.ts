import { drive } from "@googleapis/drive";
import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { AppError } from "../../utils/errors.js";
import { googleOAuthService } from "./oauth.service.js";
import { translateGoogleError, withGoogleRetry } from "./google-errors.js";

export type SheetCell = string | number | boolean;

export interface WorksheetInfo {
  id: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface WorksheetData {
  headers: string[];
  /** Data rows (excluding the header). `rowNumber` is the 1-based row number in the sheet. */
  rows: Array<{ rowNumber: number; values: SheetCell[] }>;
}

/** Quotes a worksheet title for A1 notation. */
export function sheetRange(title: string, range?: string): string {
  const quoted = `'${title.replace(/'/g, "''")}'`;
  return range ? `${quoted}!${range}` : quoted;
}

/** 0 -> A, 25 -> Z, 26 -> AA */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

async function sheetsApi(userId: string) {
  return sheets({ version: "v4", auth: await googleOAuthService.getAuthorizedClient(userId) });
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await withGoogleRetry(operation);
  } catch (error) {
    throw translateGoogleError(error);
  }
}

function normalizeHeaders(row: SheetCell[] | undefined): string[] {
  return (row ?? []).map((cell) => String(cell ?? "").trim());
}

export const sheetsService = {
  async listSpreadsheets(userId: string, options: { search?: string; pageToken?: string }) {
    const api = drive({ version: "v3", auth: await googleOAuthService.getAuthorizedClient(userId) });
    const conditions = ["mimeType = 'application/vnd.google-apps.spreadsheet'", "trashed = false"];
    if (options.search) conditions.push(`name contains '${options.search.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
    const response = await call(() =>
      api.files.list({
        q: conditions.join(" and "),
        orderBy: "modifiedTime desc",
        pageSize: 50,
        pageToken: options.pageToken,
        fields: "nextPageToken, files(id, name, modifiedTime, owners(displayName, emailAddress), webViewLink, iconLink)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      }),
    );
    return {
      spreadsheets: (response.data.files ?? []).map((file) => ({
        id: file.id!,
        name: file.name ?? "Untitled spreadsheet",
        modifiedTime: file.modifiedTime ?? null,
        owner: file.owners?.[0]?.displayName ?? file.owners?.[0]?.emailAddress ?? null,
        url: file.webViewLink ?? `https://docs.google.com/spreadsheets/d/${file.id}`,
      })),
      nextPageToken: response.data.nextPageToken ?? null,
    };
  },

  async getSpreadsheet(userId: string, spreadsheetId: string) {
    const api = await sheetsApi(userId);
    const response = await call(() =>
      api.spreadsheets.get({
        spreadsheetId,
        fields: "spreadsheetId,properties(title),spreadsheetUrl,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))",
      }),
    );
    const worksheets: WorksheetInfo[] = (response.data.sheets ?? []).map((sheet) => ({
      id: sheet.properties?.sheetId ?? 0,
      title: sheet.properties?.title ?? "Sheet",
      index: sheet.properties?.index ?? 0,
      rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
      columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
    }));
    return {
      id: response.data.spreadsheetId ?? spreadsheetId,
      name: response.data.properties?.title ?? "Untitled spreadsheet",
      url: response.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      worksheets,
    };
  },

  /** Resolves a worksheet by id, failing clearly if it was deleted. Titles can change; ids cannot. */
  async getWorksheet(userId: string, spreadsheetId: string, worksheetId: number): Promise<WorksheetInfo> {
    const spreadsheet = await this.getSpreadsheet(userId, spreadsheetId);
    const worksheet = spreadsheet.worksheets.find((sheet) => sheet.id === worksheetId);
    if (!worksheet) {
      throw new AppError(404, "GOOGLE_NOT_FOUND", `The worksheet no longer exists in "${spreadsheet.name}". Edit the sync and pick another worksheet.`);
    }
    return worksheet;
  },

  async getModifiedTime(userId: string, spreadsheetId: string): Promise<Date | null> {
    const api = drive({ version: "v3", auth: await googleOAuthService.getAuthorizedClient(userId) });
    const response = await call(() => api.files.get({ fileId: spreadsheetId, fields: "modifiedTime", supportsAllDrives: true }));
    return response.data.modifiedTime ? new Date(response.data.modifiedTime) : null;
  },

  /** Reads header + data rows. Values are unformatted (numbers stay numbers, booleans stay booleans). */
  async readWorksheet(userId: string, spreadsheetId: string, title: string, limit?: number): Promise<WorksheetData> {
    const api = await sheetsApi(userId);
    const range = limit ? sheetRange(title, `1:${limit + 1}`) : sheetRange(title);
    const response = await call(() =>
      api.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING",
        majorDimension: "ROWS",
      }),
    );
    const values = (response.data.values ?? []) as SheetCell[][];
    const headers = normalizeHeaders(values[0]);
    const rows = values.slice(1).map((row, index) => ({ rowNumber: index + 2, values: row }));
    return { headers, rows };
  },

  async writeHeaders(userId: string, spreadsheetId: string, title: string, headers: string[]) {
    const api = await sheetsApi(userId);
    await call(() =>
      api.spreadsheets.values.update({
        spreadsheetId,
        range: sheetRange(title, `A1:${columnLetter(Math.max(headers.length - 1, 0))}1`),
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      }),
    );
  },

  /** Overwrites specific rows in place. RAW input: strings are never interpreted as formulas. */
  async updateRows(userId: string, spreadsheetId: string, title: string, updates: Array<{ rowNumber: number; values: SheetCell[] }>) {
    if (!updates.length) return;
    const api = await sheetsApi(userId);
    for (let start = 0; start < updates.length; start += 500) {
      const chunk = updates.slice(start, start + 500);
      const data: sheets_v4.Schema$ValueRange[] = chunk.map((update) => ({
        range: sheetRange(title, `A${update.rowNumber}:${columnLetter(Math.max(update.values.length - 1, 0))}${update.rowNumber}`),
        values: [update.values],
      }));
      await call(() => api.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } }));
    }
  },

  async appendRows(userId: string, spreadsheetId: string, title: string, rows: SheetCell[][]) {
    if (!rows.length) return;
    const api = await sheetsApi(userId);
    for (let start = 0; start < rows.length; start += 1000) {
      const chunk = rows.slice(start, start + 1000);
      await call(() =>
        api.spreadsheets.values.append({
          spreadsheetId,
          range: sheetRange(title, "A1"),
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: chunk },
        }),
      );
    }
  },

  /** Deletes whole rows, bottom-up so earlier deletions do not shift later row numbers. */
  async deleteRows(userId: string, spreadsheetId: string, worksheetId: number, rowNumbers: number[]) {
    if (!rowNumbers.length) return;
    const api = await sheetsApi(userId);
    const sorted = [...new Set(rowNumbers)].sort((a, b) => b - a);
    const requests: sheets_v4.Schema$Request[] = sorted.map((rowNumber) => ({
      deleteDimension: { range: { sheetId: worksheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } },
    }));
    for (let start = 0; start < requests.length; start += 500) {
      const chunk = requests.slice(start, start + 500);
      await call(() => api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: chunk } }));
    }
  },
};
