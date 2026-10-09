import { describe, expect, it } from "vitest";
import { formatBytes, pluralize, timeAgo } from "./format";

describe("timeAgo", () => {
  const now = new Date("2024-06-01T12:00:00Z").getTime();
  it("handles never and just now", () => {
    expect(timeAgo(null, now)).toBe("Never");
    expect(timeAgo(new Date(now - 10_000), now)).toBe("Just now");
  });
  it("renders minutes and hours", () => {
    expect(timeAgo(new Date(now - 5 * 60_000), now)).toMatch(/5 minutes ago/);
    expect(timeAgo(new Date(now - 2 * 3600_000), now)).toMatch(/2 hours ago/);
  });
});

describe("formatting helpers", () => {
  it("formats bytes and plurals", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(pluralize(1, "row")).toBe("1 row");
    expect(pluralize(3, "row")).toBe("3 rows");
  });
});
