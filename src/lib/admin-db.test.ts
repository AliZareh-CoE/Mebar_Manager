import { describe, expect, it } from "vitest";
import {
  ADMIN_TABLES,
  adminColumns,
  adminTableNames,
  coerceValue,
  type AdminColumn,
} from "./admin-db";

const col = (over: Partial<AdminColumn>): AdminColumn => ({
  key: "x",
  dbName: "x",
  kind: "text",
  notNull: false,
  hasDefault: false,
  ...over,
});

describe("admin-db registry", () => {
  it("includes every domain table plus auth", () => {
    for (const name of [
      "projects",
      "tasks",
      "data_requests",
      "utf_students",
      "lab_settings",
      "user",
      "session",
    ]) {
      expect(adminTableNames()).toContain(name);
    }
  });

  it("derives typed columns with metadata", () => {
    const cols = adminColumns(ADMIN_TABLES["utf_students"]);
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey.id.kind).toBe("text");
    expect(byKey.archived.kind).toBe("boolean");
    expect(byKey.createdAt.kind).toBe("date");
    expect(byKey.name.notNull).toBe(true);
    expect(byKey.createdAt.hasDefault).toBe(true);
  });

  it("maps json columns", () => {
    const cols = adminColumns(ADMIN_TABLES["projects"]);
    expect(cols.find((c) => c.key === "extraAnswers")?.kind).toBe("json");
  });
});

describe("coerceValue", () => {
  it("booleans: checkbox on/absent", () => {
    const b = col({ kind: "boolean", notNull: true });
    expect(coerceValue(b, "on")).toEqual({ ok: true, value: true });
    expect(coerceValue(b, null)).toEqual({ ok: true, value: false });
  });

  it("empty nullable → null; empty required text → \"\"", () => {
    expect(coerceValue(col({ notNull: false }), "")).toEqual({ ok: true, value: null });
    expect(coerceValue(col({ kind: "date", notNull: false }), "")).toEqual({
      ok: true,
      value: null,
    });
    expect(coerceValue(col({ kind: "text", notNull: true }), "")).toEqual({
      ok: true,
      value: "",
    });
  });

  it("empty required non-text → error", () => {
    expect(coerceValue(col({ kind: "date", notNull: true }), "").ok).toBe(false);
    expect(coerceValue(col({ kind: "number", notNull: true }), "").ok).toBe(false);
  });

  it("numbers and dates parse; garbage errors", () => {
    expect(coerceValue(col({ kind: "number" }), "42")).toEqual({ ok: true, value: 42 });
    expect(coerceValue(col({ kind: "number" }), "nope").ok).toBe(false);
    const d = coerceValue(col({ kind: "date" }), "2026-07-25T14:30");
    expect(d.ok && d.value instanceof Date).toBe(true);
    expect(coerceValue(col({ kind: "date" }), "not-a-date").ok).toBe(false);
  });

  it("json parses; invalid json errors", () => {
    expect(coerceValue(col({ kind: "json" }), '{"a":1}')).toEqual({
      ok: true,
      value: { a: 1 },
    });
    expect(coerceValue(col({ kind: "json" }), "{oops").ok).toBe(false);
  });
});
