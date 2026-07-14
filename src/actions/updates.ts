"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { updates } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { parseForm, type ActionResult } from "@/lib/action-utils";

const addUpdateSchema = z.object({
  whatMoved: z.string().trim().min(1, "What moved is required — even 'nothing' is information"),
  whatsBlocked: z.string().trim().default(""),
  whatsNext: z.string().trim().min(1, "What's next is required"),
});

export async function addUpdate(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();

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
