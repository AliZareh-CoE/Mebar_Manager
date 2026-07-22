"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { utfStudents } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { logAudit } from "@/lib/audit";

/**
 * The UTF-student roster: name-only entries with no accounts and no app
 * access, curated by the admin so lineups can tag them consistently.
 * Archive, never delete — tagged history keeps rendering.
 */

function revalidateRoster() {
  revalidatePath("/admin/users");
}

const nameSchema = z.object({
  name: z.string().trim().min(1, "The student needs a name.").max(80),
});

export async function addUtfStudent(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = parseForm(nameSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const row = await db
    .insert(utfStudents)
    .values({ name: parsed.data.name })
    .returning()
    .get();
  revalidateRoster();
  void logAudit(me.id, "utfStudent.add", "utfStudent", row.id,
    `Added UTF student ${parsed.data.name}`);
  return {};
}

export async function renameUtfStudent(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = parseForm(nameSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const student = await db.select().from(utfStudents).where(eq(utfStudents.id, id)).get();
  if (!student) return { error: "Student not found." };

  await db.update(utfStudents).set({ name: parsed.data.name }).where(eq(utfStudents.id, id));
  revalidateRoster();
  void logAudit(me.id, "utfStudent.rename", "utfStudent", id,
    `Renamed UTF student ${student.name} → ${parsed.data.name}`);
  return {};
}

export async function setUtfStudentArchived(
  id: string,
  archived: boolean
): Promise<ActionResult> {
  const me = await requireAdmin();

  const student = await db.select().from(utfStudents).where(eq(utfStudents.id, id)).get();
  if (!student) return { error: "Student not found." };

  await db.update(utfStudents).set({ archived }).where(eq(utfStudents.id, id));
  revalidateRoster();
  void logAudit(me.id, "utfStudent.archive", "utfStudent", id,
    `${archived ? "Archived" : "Restored"} UTF student ${student.name}`);
  return {};
}
