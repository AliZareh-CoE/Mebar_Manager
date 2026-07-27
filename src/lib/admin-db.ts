import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "@/lib/db/schema";

/**
 * The generic /admin/db editor's schema layer: every Drizzle table in the
 * app, with just enough column metadata to render a form and coerce its
 * values back. Pure and DB-free so the coercion rules are unit-testable.
 */

export type ColumnKind = "text" | "number" | "boolean" | "date" | "json";

export type AdminColumn = {
  /** TS property name — the record key and the form field name. */
  key: string;
  /** Column name in SQLite, shown to the admin. */
  dbName: string;
  kind: ColumnKind;
  notNull: boolean;
  hasDefault: boolean;
};

const TABLE_ENTRIES: [string, SQLiteTable][] = Object.entries(
  schema as Record<string, unknown>
)
  .filter(
    ([, v]) =>
      typeof v === "object" && v !== null && Symbol.for("drizzle:IsDrizzleTable") in v
  )
  .map(([k, v]) => [k, v as SQLiteTable]);

/** db table name → drizzle table object. Every table, auth included. */
export const ADMIN_TABLES: Record<string, SQLiteTable> = Object.fromEntries(
  TABLE_ENTRIES.map(([, table]) => [getTableName(table), table])
);

export function adminTableNames(): string[] {
  return Object.keys(ADMIN_TABLES).sort();
}

function kindOf(columnType: string): ColumnKind {
  switch (columnType) {
    case "SQLiteBoolean":
      return "boolean";
    case "SQLiteTimestamp":
      return "date";
    case "SQLiteInteger":
      return "number";
    case "SQLiteTextJson":
      return "json";
    default:
      return "text";
  }
}

export function adminColumns(table: SQLiteTable): AdminColumn[] {
  return Object.entries(getTableColumns(table)).map(([key, c]) => ({
    key,
    dbName: c.name,
    kind: kindOf(c.columnType),
    notNull: c.notNull,
    hasDefault: c.hasDefault,
  }));
}

export type Coerced = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Parse one submitted form value into a column value. Booleans come from
 * checkboxes ("on" or absent). Empty inputs become NULL where the column
 * allows it, "" for required text, and an error for required non-text.
 */
export function coerceValue(col: AdminColumn, raw: string | null): Coerced {
  if (col.kind === "boolean") {
    return { ok: true, value: raw === "on" || raw === "true" };
  }
  const empty = raw === null || raw.trim() === "";
  if (empty) {
    if (!col.notNull) return { ok: true, value: null };
    if (col.kind === "text") return { ok: true, value: "" };
    return { ok: false, error: `${col.dbName} is required.` };
  }
  switch (col.kind) {
    case "number": {
      const n = Number(raw);
      if (Number.isNaN(n)) return { ok: false, error: `${col.dbName} must be a number.` };
      return { ok: true, value: n };
    }
    case "date": {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime()))
        return { ok: false, error: `${col.dbName} must be a valid date.` };
      return { ok: true, value: d };
    }
    case "json": {
      try {
        return { ok: true, value: JSON.parse(raw) };
      } catch {
        return { ok: false, error: `${col.dbName} must be valid JSON.` };
      }
    }
    default:
      return { ok: true, value: raw };
  }
}
