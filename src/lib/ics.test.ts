import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText } from "./ics";

describe("escapeIcsText", () => {
  it("escapes commas, semicolons, backslashes, newlines", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("buildIcs", () => {
  it("emits a valid skeleton with all-day events and CRLF endings", () => {
    const ics = buildIcs("Mebar deadlines", [
      { uid: "task-1", date: new Date(Date.UTC(2026, 7, 3)), summary: "Task: order o-rings" },
    ]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Mebar deadlines");
    expect(ics).toContain("UID:task-1@mebarmanager");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260803");
    expect(ics).toContain("SUMMARY:Task: order o-rings");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("handles zero events", () => {
    const ics = buildIcs("Empty", []);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
