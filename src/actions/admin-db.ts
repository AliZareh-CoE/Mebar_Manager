"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ADMIN_TABLES, adminColumns, coerceValue } from "@/lib/admin-db";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/lib/action-utils";

/**
 * The /admin/db editor's write path. ADMIN only, every write audit-logged.
 * This is the god-mode tool: no domain validation on purpose — the whole
 * point is fixing records the normal rules won't let anyone touch.
 */

type Prepared =
  | { error: string }
  | { table: (typeof ADMIN_TABLES)[string]; cols: ReturnType<typeof adminColumns>; meId: string };

async function prepare(tableName: string): Promise<Prepared> {
  const me = await requireUser();
  if (me.role !== "ADMIN") return { error: "Admins only." };
  const table = ADMIN_TABLES[tableName];
  if (!table) return { error: "Unknown table." };
  return { table, cols: adminColumns(table), meId: me.id };
}

/** lab_settings has an integer id; everything else uses text ids. */
function idValue(cols: ReturnType<typeof adminColumns>, rowId: string): unknown {
  return cols.find((c) => c.key === "id")?.kind === "number" ? Number(rowId) : rowId;
}

function idColumn(table: (typeof ADMIN_TABLES)[string]) {
  return (table as unknown as Record<string, never>)["id"];
}

function friendly(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return `Write failed: ${msg}`;
}

export async function adminUpdateRow(
  tableName: string,
  rowId: string,
  formData: FormData
): Promise<ActionResult> {
  const prep = await prepare(tableName);
  if ("error" in prep) return { error: prep.error };
  const { table, cols, meId } = prep;

  const values: Record<string, unknown> = {};
  for (const col of cols) {
    if (col.key === "id") continue;
    // Checkboxes are absent when unchecked; every other field is always
    // rendered, so absence means "leave untouched".
    if (!formData.has(col.key) && col.kind !== "boolean") continue;
    const parsed = coerceValue(col, formData.get(col.key) as string | null);
    if (!parsed.ok) return { error: parsed.error };
    values[col.key] = parsed.value;
  }
  if (Object.keys(values).length === 0) return { error: "Nothing to update." };

  try {
    const result = db
      .update(table)
      .set(values)
      .where(eq(idColumn(table), idValue(cols, rowId)))
      .run();
    if (result.changes === 0) return { error: "Row not found." };
  } catch (error) {
    return { error: friendly(error) };
  }

  revalidatePath("/", "layout");
  void logAudit(meId, "admin.db.update", "db", `${tableName}:${rowId}`, `${tableName} row edited`, {
    table: tableName,
    rowId,
    fields: Object.keys(values),
  });
  return {};
}

export async function adminInsertRow(
  tableName: string,
  formData: FormData
): Promise<ActionResult> {
  const prep = await prepare(tableName);
  if ("error" in prep) return { error: prep.error };
  const { table, cols, meId } = prep;

  const values: Record<string, unknown> = {};
  for (const col of cols) {
    const raw = formData.get(col.key) as string | null;
    const empty = col.kind !== "boolean" && (raw === null || raw.trim() === "");
    // Blank + a schema default = let the default fill it (ids, createdAt).
    if (empty && col.hasDefault) continue;
    const parsed = coerceValue(col, raw);
    if (!parsed.ok) return { error: parsed.error };
    values[col.key] = parsed.value;
  }

  try {
    db.insert(table)
      .values(values as never)
      .run();
  } catch (error) {
    return { error: friendly(error) };
  }

  revalidatePath("/", "layout");
  void logAudit(meId, "admin.db.insert", "db", tableName, `${tableName} row added`, {
    table: tableName,
    fields: Object.keys(values),
  });
  return {};
}

export async function adminDeleteRow(
  tableName: string,
  rowId: string
): Promise<ActionResult> {
  const prep = await prepare(tableName);
  if ("error" in prep) return { error: prep.error };
  const { table, cols, meId } = prep;

  try {
    const result = db.delete(table).where(eq(idColumn(table), idValue(cols, rowId))).run();
    if (result.changes === 0) return { error: "Row not found." };
  } catch (error) {
    return { error: friendly(error) };
  }

  revalidatePath("/", "layout");
  void logAudit(meId, "admin.db.delete", "db", `${tableName}:${rowId}`, `${tableName} row deleted`, {
    table: tableName,
    rowId,
  });
  return {};
}

