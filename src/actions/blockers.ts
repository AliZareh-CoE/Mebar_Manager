"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { blockers, CAUSE_TAGS } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";

function revalidateBlocker(projectId: string) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/projects/${projectId}`);
}

const raiseBlockerSchema = z.object({
  description: z.string().trim().min(1, "Describe what's stuck, what you tried, and what you need"),
  causeTag: z.enum(CAUSE_TAGS),
  ownerId: z.string().optional(),
  deadline: z.coerce.date({ error: "A deadline is required — blockers without deadlines rot" }),
});

export async function raiseBlocker(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireUser();

  const parsed = parseForm(raiseBlockerSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.insert(blockers).values({
    projectId,
    description: parsed.data.description,
    causeTag: parsed.data.causeTag,
    ownerId: parsed.data.ownerId || null,
    deadline: parsed.data.deadline,
  });

  revalidateBlocker(projectId);
  return {};
}

export async function resolveBlocker(
  blockerId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireUser();

  const resolutionNote = String(formData.get("resolutionNote") ?? "");
  const blocker = await db.select().from(blockers).where(eq(blockers.id, blockerId)).get();
  if (!blocker) return { error: "Blocker not found." };
  if (blocker.status === "RESOLVED" || blocker.status === "CANCELLED") {
    return { error: "This blocker is closed." };
  }
  if (!resolutionNote.trim()) {
    return { error: "Write how it was solved — the next person will hit this too." };
  }

  await db
    .update(blockers)
    .set({ status: "RESOLVED", resolutionNote: resolutionNote.trim(), resolvedAt: new Date() })
    .where(eq(blockers.id, blockerId));

  revalidateBlocker(blocker.projectId);
  return {};
}

export async function assignBlocker(
  blockerId: string,
  ownerId: string
): Promise<ActionResult> {
  await requireUser();

  const blocker = await db.select().from(blockers).where(eq(blockers.id, blockerId)).get();
  if (!blocker) return { error: "Blocker not found." };
  if (blocker.status === "RESOLVED" || blocker.status === "CANCELLED") {
    return { error: "This blocker is closed." };
  }

  await db.update(blockers).set({ ownerId: ownerId || null }).where(eq(blockers.id, blockerId));
  revalidateBlocker(blocker.projectId);
  return {};
}

const editBlockerSchema = z.object({
  description: z.string().trim().min(1, "Describe what's stuck"),
  causeTag: z.enum(CAUSE_TAGS),
  deadline: z.coerce.date({ error: "A deadline is required" }),
});

export async function editBlocker(
  blockerId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(editBlockerSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const blocker = await db.select().from(blockers).where(eq(blockers.id, blockerId)).get();
  if (!blocker) return { error: "Blocker not found." };
  if (blocker.status === "RESOLVED" || blocker.status === "CANCELLED") {
    return { error: "This blocker is closed." };
  }

  const policy = await getPolicy(me);
  if (!policy.can("blocker.edit", { involvedUserIds: [blocker.ownerId] })) {
    return { error: "You don't have permission to edit this blocker." };
  }

  await db.update(blockers).set(parsed.data).where(eq(blockers.id, blockerId));
  revalidateBlocker(blocker.projectId);
  return {};
}

export async function cancelBlocker(
  blockerId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it's no longer a blocker — for the record." };

  const blocker = await db.select().from(blockers).where(eq(blockers.id, blockerId)).get();
  if (!blocker) return { error: "Blocker not found." };
  if (blocker.status === "RESOLVED" || blocker.status === "CANCELLED") {
    return { error: "This blocker is already closed." };
  }

  const policy = await getPolicy(me);
  if (!policy.can("blocker.cancel", { involvedUserIds: [blocker.ownerId] })) {
    return { error: "You don't have permission to cancel this blocker." };
  }

  await db
    .update(blockers)
    .set({ status: "CANCELLED", resolutionNote: reason, resolvedAt: new Date() })
    .where(eq(blockers.id, blockerId));

  revalidateBlocker(blocker.projectId);
  return {};
}

export async function escalateBlocker(blockerId: string): Promise<ActionResult> {
  await requireUser();

  const blocker = await db.select().from(blockers).where(eq(blockers.id, blockerId)).get();
  if (!blocker) return { error: "Blocker not found." };
  if (blocker.status !== "OPEN") return { error: "Only open blockers can be escalated." };

  await db.update(blockers).set({ status: "ESCALATED" }).where(eq(blockers.id, blockerId));
  revalidateBlocker(blocker.projectId);
  return {};
}
