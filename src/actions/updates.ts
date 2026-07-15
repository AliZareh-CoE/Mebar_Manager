"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { updates } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { canAccessProject } from "@/lib/visibility";

const addUpdateSchema = z.object({
  whatMoved: z.string().trim().min(1, "What moved is required — even 'nothing' is information"),
  whatsBlocked: z.string().trim().default(""),
  whatsNext: z.string().trim().min(1, "What's next is required"),
});

export async function editUpdate(
  updateId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = parseForm(addUpdateSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const update = await db.select().from(updates).where(eq(updates.id, updateId)).get();
  if (!update) return { error: "Update not found." };

  const policy = await getPolicy(user);
  if (!policy.can("update.edit", { involvedUserIds: [update.authorId] })) {
    return { error: "Only the author (or someone with edit rights) can edit this." };
  }

  // createdAt is untouched: editing doesn't reset the stall clock.
  await db.update(updates).set(parsed.data).where(eq(updates.id, updateId));

  revalidatePath("/");
  revalidatePath(`/projects/${update.projectId}`);
  return {};
}

export async function addUpdate(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await canAccessProject(user, projectId))) return { error: "Project not found." };

  const parsed = parseForm(addUpdateSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.insert(updates).values({
    projectId,
    authorId: user.id,
    ...parsed.data,
  });

  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/projects/${projectId}`);
  return {};
}
