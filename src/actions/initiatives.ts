"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { initiatives, user } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { isLabLeadership } from "@/lib/policy";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { notifyAssignment } from "@/lib/notify";

function revalidateInitiative() {
  revalidatePath("/");
  revalidatePath("/initiatives");
}

async function verifyLeadership(userId: string): Promise<string | null> {
  const target = await db.select().from(user).where(eq(user.id, userId)).get();
  if (!target || target.banned) return "That account is not available.";
  if (target.role !== "MANAGER" && target.role !== "ADMIN" && !target.isComputeCoordinator) {
    return "Initiatives are assigned to a manager or the compute coordinator.";
  }
  return null;
}

const fileInitiativeSchema = z.object({
  title: z.string().trim().min(1, "What's the fight?"),
  description: z.string().trim().default(""),
  deadline: z.coerce.date({ error: "A deadline is required — big fights rot fastest" }),
  assigneeId: z.string().optional(),
});

export async function fileInitiative(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("initiative.file")) {
    return { error: "Only managers and the compute coordinator file initiatives." };
  }

  const parsed = parseForm(fileInitiativeSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const assigneeId = parsed.data.assigneeId || null;
  if (assigneeId) {
    const problem = await verifyLeadership(assigneeId);
    if (problem) return { error: problem };
  }

  await db.insert(initiatives).values({
    title: parsed.data.title,
    description: parsed.data.description,
    deadline: parsed.data.deadline,
    requesterId: me.id,
    assigneeId,
  });

  revalidateInitiative();
  if (assigneeId) {
    void notifyAssignment(assigneeId, {
      actorId: me.id,
      actorName: me.name,
      what: `Initiative: ${parsed.data.title}`,
      due: parsed.data.deadline,
    });
  }
  return {};
}

export async function assignInitiative(
  initiativeId: string,
  assigneeId: string
): Promise<ActionResult> {
  const me = await requireUser();

  const initiative = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .get();
  if (!initiative) return { error: "Initiative not found." };
  if (initiative.status !== "OPEN") return { error: "This fight is over." };

  const policy = await getPolicy(me);
  const selfClaim = isLabLeadership(me) && assigneeId === me.id;
  if (
    !selfClaim &&
    !policy.can("initiative.edit", {
      involvedUserIds: [initiative.requesterId, initiative.assigneeId],
    })
  ) {
    return { error: "Only leadership involved in this initiative can assign it." };
  }

  const problem = await verifyLeadership(assigneeId);
  if (problem) return { error: problem };

  await db.update(initiatives).set({ assigneeId }).where(eq(initiatives.id, initiativeId));
  revalidateInitiative();
  void notifyAssignment(assigneeId, {
    actorId: me.id,
    actorName: me.name,
    what: `Initiative: ${initiative.title}`,
    due: initiative.deadline,
  });
  return {};
}

const closeInitiativeSchema = z.object({
  outcome: z.enum(["WON", "LOST"]),
  closureNote: z
    .string()
    .trim()
    .min(1, "What happened? Wins get celebrated, losses get learned from — on the record."),
});

export async function closeInitiative(
  initiativeId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(closeInitiativeSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const initiative = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .get();
  if (!initiative) return { error: "Initiative not found." };
  if (initiative.status !== "OPEN") return { error: "This fight is already closed." };

  const policy = await getPolicy(me);
  if (
    !policy.can("initiative.edit", {
      involvedUserIds: [initiative.requesterId, initiative.assigneeId],
    })
  ) {
    return { error: "Only leadership involved in this initiative can close it." };
  }

  await db
    .update(initiatives)
    .set({
      status: parsed.data.outcome,
      closureNote: parsed.data.closureNote,
      closedAt: new Date(),
    })
    .where(eq(initiatives.id, initiativeId));

  revalidateInitiative();
  return {};
}

const editInitiativeSchema = z.object({
  title: z.string().trim().min(1, "What's the fight?"),
  description: z.string().trim().default(""),
  deadline: z.coerce.date({ error: "A deadline is required" }),
  assigneeId: z.string().optional(),
});

export async function editInitiative(
  initiativeId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(editInitiativeSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const initiative = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .get();
  if (!initiative) return { error: "Initiative not found." };
  if (initiative.status !== "OPEN") return { error: "This fight is closed." };

  const policy = await getPolicy(me);
  if (
    !policy.can("initiative.edit", {
      involvedUserIds: [initiative.requesterId, initiative.assigneeId],
    })
  ) {
    return { error: "You don't have permission to edit this initiative." };
  }

  // Only touch the assignee when the form actually sent the field.
  const assigneeSent = formData.has("assigneeId");
  const assigneeId = assigneeSent
    ? parsed.data.assigneeId || null
    : initiative.assigneeId;
  if (assigneeSent && assigneeId && assigneeId !== initiative.assigneeId) {
    const problem = await verifyLeadership(assigneeId);
    if (problem) return { error: problem };
  }

  await db
    .update(initiatives)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      deadline: parsed.data.deadline,
      assigneeId,
    })
    .where(eq(initiatives.id, initiativeId));

  revalidateInitiative();
  return {};
}

export async function cancelInitiative(
  initiativeId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why the lab is no longer fighting this." };

  const initiative = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .get();
  if (!initiative) return { error: "Initiative not found." };
  if (initiative.status !== "OPEN") return { error: "This fight is already closed." };

  const policy = await getPolicy(me);
  if (
    !policy.can("initiative.edit", {
      involvedUserIds: [initiative.requesterId, initiative.assigneeId],
    })
  ) {
    return { error: "You don't have permission to cancel this initiative." };
  }

  await db
    .update(initiatives)
    .set({ status: "CANCELLED", closureNote: reason, closedAt: new Date() })
    .where(eq(initiatives.id, initiativeId));

  revalidateInitiative();
  return {};
}
