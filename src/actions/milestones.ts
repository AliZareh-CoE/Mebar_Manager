"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { milestones, MILESTONE_STATUSES } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { parseForm, type ActionResult } from "@/lib/action-utils";

function revalidateMilestone(projectId: string) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/projects/${projectId}`);
}

const addMilestoneSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    deliverable: z.string().trim().min(1, "Say what will exist when this is done"),
    startDate: z.coerce.date(),
    dueDate: z.coerce.date(),
  })
  .refine((m) => m.dueDate > m.startDate, {
    message: "Due date must be after the start date",
    path: ["dueDate"],
  });

export async function addMilestone(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireUser();

  const parsed = parseForm(addMilestoneSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.insert(milestones).values({ projectId, ...parsed.data });
  revalidateMilestone(projectId);
  return {};
}

export async function setMilestoneStatus(
  milestoneId: string,
  status: (typeof MILESTONE_STATUSES)[number]
): Promise<ActionResult> {
  await requireUser();

  if (!MILESTONE_STATUSES.includes(status)) return { error: "Invalid status." };

  const milestone = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .get();
  if (!milestone) return { error: "Milestone not found." };

  await db
    .update(milestones)
    .set({ status, completedAt: status === "DONE" ? new Date() : null })
    .where(eq(milestones.id, milestoneId));

  revalidateMilestone(milestone.projectId);
  return {};
}

const pushDueDateSchema = z.object({ dueDate: z.coerce.date() });

export async function pushMilestoneDueDate(
  milestoneId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireUser();

  const parsed = parseForm(pushDueDateSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const milestone = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .get();
  if (!milestone) return { error: "Milestone not found." };
  if (milestone.status === "DONE") return { error: "Milestone is already done." };

  await db
    .update(milestones)
    .set({ dueDate: parsed.data.dueDate })
    .where(eq(milestones.id, milestoneId));

  revalidateMilestone(milestone.projectId);
  return {};
}
