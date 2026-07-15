"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { milestones, MILESTONE_STATUSES } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { canAccessProject } from "@/lib/visibility";

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
  const me = await requireUser();
  if (!(await canAccessProject(me, projectId))) return { error: "Project not found." };

  const parsed = parseForm(addMilestoneSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.insert(milestones).values({ projectId, ...parsed.data });
  revalidateMilestone(projectId);
  return {};
}

const WORKFLOW_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE"] as const;

export async function setMilestoneStatus(
  milestoneId: string,
  status: (typeof MILESTONE_STATUSES)[number]
): Promise<ActionResult> {
  const me = await requireUser();

  // Cancellation goes exclusively through cancelMilestone (policy-gated),
  // and closed milestones stay closed.
  if (!WORKFLOW_STATUSES.includes(status as (typeof WORKFLOW_STATUSES)[number])) {
    return { error: "Invalid status." };
  }

  const milestone = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .get();
  if (!milestone) return { error: "Milestone not found." };
  if (!(await canAccessProject(me, milestone.projectId))) {
    return { error: "Milestone not found." };
  }
  if (milestone.status === "DONE" || milestone.status === "CANCELLED") {
    return { error: "This milestone is closed." };
  }

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

export async function editMilestone(
  milestoneId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(addMilestoneSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const milestone = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .get();
  if (!milestone) return { error: "Milestone not found." };
  if (milestone.status === "DONE" || milestone.status === "CANCELLED") {
    return { error: "This milestone is closed." };
  }

  const policy = await getPolicy(me);
  if (!policy.can("milestone.edit")) {
    return { error: "You don't have permission to edit milestones." };
  }

  await db.update(milestones).set(parsed.data).where(eq(milestones.id, milestoneId));
  revalidateMilestone(milestone.projectId);
  return {};
}

export async function cancelMilestone(
  milestoneId: string,
  _formData?: FormData
): Promise<ActionResult> {
  void _formData;
  const me = await requireUser();

  const milestone = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .get();
  if (!milestone) return { error: "Milestone not found." };
  if (milestone.status === "DONE" || milestone.status === "CANCELLED") {
    return { error: "This milestone is already closed." };
  }

  const policy = await getPolicy(me);
  if (!policy.can("milestone.cancel")) {
    return { error: "You don't have permission to cancel milestones." };
  }

  await db
    .update(milestones)
    .set({ status: "CANCELLED" })
    .where(eq(milestones.id, milestoneId));

  revalidateMilestone(milestone.projectId);
  return {};
}
