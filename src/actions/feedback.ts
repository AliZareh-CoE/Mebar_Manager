"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { feedback, FEEDBACK_KINDS, FEEDBACK_STATUSES } from "@/lib/db/schema";
import { requireUser, requireAdmin } from "@/lib/session";
import { parseForm, type ActionResult } from "@/lib/action-utils";

const submitFeedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  title: z.string().trim().min(1, "One line: what is it?").max(120),
  body: z
    .string()
    .trim()
    .min(1, "Details help it get fixed/built — what happened, or what you wish existed."),
});

/** Any signed-in role may submit — feedback is named, never anonymous. */
export async function submitFeedback(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(submitFeedbackSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.insert(feedback).values({ ...parsed.data, submitterId: me.id });
  revalidatePath("/admin/feedback");
  return {};
}

const respondSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
  adminResponse: z.string().trim().default(""),
});

export async function respondToFeedback(
  feedbackId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = parseForm(respondSchema, formData);
  if (!parsed.success) return { error: parsed.error };
  if (parsed.data.status === "DECLINED" && !parsed.data.adminResponse) {
    return { error: "Declining needs a reason — that's how feedback keeps coming." };
  }

  const row = await db.select().from(feedback).where(eq(feedback.id, feedbackId)).get();
  if (!row) return { error: "Feedback not found." };

  await db
    .update(feedback)
    .set({
      status: parsed.data.status,
      adminResponse: parsed.data.adminResponse || null,
      respondedById: me.id,
      respondedAt: new Date(),
    })
    .where(eq(feedback.id, feedbackId));

  revalidatePath("/admin/feedback");
  return {};
}
