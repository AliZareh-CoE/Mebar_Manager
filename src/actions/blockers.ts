"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { blockerDisputes, blockers } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { isLabLeadership } from "@/lib/policy";
import { notifyProjectEvent } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { notifyAssignment } from "@/lib/notify";
import { canAccessProject } from "@/lib/visibility";

/** Non-archived cause-tag keys, plus optionally a row's current tag. */
async function selectableCauseTags(current?: string): Promise<Set<string>> {
  const settings = await getSettings();
  const keys = new Set(
    settings.causeTags.filter((t) => !t.archived).map((t) => t.key)
  );
  if (current) keys.add(current);
  return keys;
}

function revalidateBlocker(projectId: string) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/projects/${projectId}`);
}

const raiseBlockerSchema = z.object({
  description: z.string().trim().min(1, "Describe what's stuck, what you tried, and what you need"),
  causeTag: z.string(),
  ownerId: z.string().optional(),
  deadline: z.coerce.date({ error: "A deadline is required — blockers without deadlines rot" }),
});

export async function raiseBlocker(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  if (!(await canAccessProject(me, projectId))) return { error: "Project not found." };

  const parsed = parseForm(raiseBlockerSchema, formData);
  if (!parsed.success) return { error: parsed.error };
  if (!(await selectableCauseTags()).has(parsed.data.causeTag)) {
    return { error: "Pick a valid cause." };
  }

  await db.insert(blockers).values({
    projectId,
    description: parsed.data.description,
    causeTag: parsed.data.causeTag,
    ownerId: parsed.data.ownerId || null,
    raisedById: me.id,
    deadline: parsed.data.deadline,
  });

  revalidateBlocker(projectId);
  if (parsed.data.ownerId) {
    void notifyAssignment(parsed.data.ownerId, {
      actorId: me.id,
      actorName: me.name,
      what: `Blocker: ${parsed.data.description.slice(0, 120)}`,
      due: parsed.data.deadline,
    });
  }
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
  const me = await requireUser();

  const blocker = await db.select().from(blockers).where(eq(blockers.id, blockerId)).get();
  if (!blocker) return { error: "Blocker not found." };
  if (!(await canAccessProject(me, blocker.projectId))) return { error: "Blocker not found." };
  if (blocker.status === "RESOLVED" || blocker.status === "CANCELLED") {
    return { error: "This blocker is closed." };
  }

  await db.update(blockers).set({ ownerId: ownerId || null }).where(eq(blockers.id, blockerId));
  revalidateBlocker(blocker.projectId);
  if (ownerId) {
    void notifyAssignment(ownerId, {
      actorId: me.id,
      actorName: me.name,
      what: `Blocker: ${blocker.description.slice(0, 120)}`,
      due: blocker.deadline,
    });
  }
  return {};
}

const editBlockerSchema = z.object({
  description: z.string().trim().min(1, "Describe what's stuck"),
  causeTag: z.string(),
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
  // Archived tags stay valid on rows that already carry them.
  if (!(await selectableCauseTags(blocker.causeTag)).has(parsed.data.causeTag)) {
    return { error: "Pick a valid cause." };
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
  const me = await requireUser();

  const blocker = await db.select().from(blockers).where(eq(blockers.id, blockerId)).get();
  if (!blocker) return { error: "Blocker not found." };
  if (!(await canAccessProject(me, blocker.projectId))) return { error: "Blocker not found." };
  if (blocker.status !== "OPEN") return { error: "Only open blockers can be escalated." };

  await db.update(blockers).set({ status: "ESCALATED" }).where(eq(blockers.id, blockerId));
  revalidateBlocker(blocker.projectId);
  return {};
}

const disputeSchema = z.object({
  note: z.string().trim().min(1, "Say what you found — the verdict goes on the record."),
});

/**
 * Leadership audit verdict: a RESOLVED blocker that wasn't actually solved.
 * Reopens the blocker and records a dispute row — the performance engine
 * scores it as a negative falseResolution for the owner who claimed it.
 */
export async function disputeResolution(
  blockerId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  if (!isLabLeadership(me)) {
    return { error: "Only coordinators and managers can dispute a resolution." };
  }

  const parsed = parseForm(disputeSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const blocker = await db.select().from(blockers).where(eq(blockers.id, blockerId)).get();
  if (!blocker) return { error: "Blocker not found." };
  if (blocker.status !== "RESOLVED") {
    return { error: "Only resolved blockers can be disputed." };
  }

  db.transaction((tx) => {
    tx.insert(blockerDisputes)
      .values({
        blockerId,
        penalizedUserId: blocker.ownerId,
        byUserId: me.id,
        note: parsed.data.note,
      })
      .run();
    // Back to the fight — the old resolution note stays on the record.
    tx.update(blockers)
      .set({ status: "OPEN", resolvedAt: null })
      .where(eq(blockers.id, blockerId))
      .run();
  });

  revalidateBlocker(blocker.projectId);
  revalidatePath("/blockers");
  void logAudit(
    me.id,
    "blocker.dispute",
    "blocker",
    blockerId,
    `resolution disputed as false: ${parsed.data.note.slice(0, 120)}`,
    { penalizedUserId: blocker.ownerId, note: parsed.data.note }
  );
  void notifyProjectEvent(blocker.projectId, {
    title: "Blocker resolution disputed",
    lines: [
      `${me.name} audited "${blocker.description.slice(0, 120)}" and found it not actually solved. It is back open.`,
      `Verdict: ${parsed.data.note}`,
    ],
  });
  return {};
}
