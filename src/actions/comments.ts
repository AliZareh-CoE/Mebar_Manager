"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projectComments } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { isManagerOrAbove } from "@/lib/policy";
import { canAccessProject } from "@/lib/visibility";
import { notifyProjectEvent } from "@/lib/notify";
import { parseForm, type ActionResult } from "@/lib/action-utils";

const commentSchema = z.object({
  body: z.string().trim().min(1, "Say something.").max(4000),
});

/** Anyone who can see the project can talk on it. Watchers hear about it. */
export async function addComment(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  if (!(await canAccessProject(me, projectId))) return { error: "Project not found." };

  const parsed = parseForm(commentSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.insert(projectComments).values({
    projectId,
    authorId: me.id,
    body: parsed.data.body,
  });

  revalidatePath(`/projects/${projectId}`);
  void notifyProjectEvent(projectId, {
    title: `New comment from ${me.name}`,
    lines: [parsed.data.body.length > 300 ? parsed.data.body.slice(0, 297) + "…" : parsed.data.body],
  });
  return {};
}

/** Authors fix their own words; managers can moderate. */
export async function editComment(
  commentId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  const comment = await db
    .select()
    .from(projectComments)
    .where(eq(projectComments.id, commentId))
    .get();
  if (!comment) return { error: "Comment not found." };
  if (comment.authorId !== me.id && !isManagerOrAbove(me)) {
    return { error: "You can only edit your own comments." };
  }

  const parsed = parseForm(commentSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db
    .update(projectComments)
    .set({ body: parsed.data.body })
    .where(eq(projectComments.id, commentId));
  revalidatePath(`/projects/${comment.projectId}`);
  return {};
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const me = await requireUser();
  const comment = await db
    .select()
    .from(projectComments)
    .where(eq(projectComments.id, commentId))
    .get();
  if (!comment) return { error: "Comment not found." };
  if (comment.authorId !== me.id && !isManagerOrAbove(me)) {
    return { error: "You can only delete your own comments." };
  }

  await db.delete(projectComments).where(eq(projectComments.id, commentId));
  revalidatePath(`/projects/${comment.projectId}`);
  return {};
}
