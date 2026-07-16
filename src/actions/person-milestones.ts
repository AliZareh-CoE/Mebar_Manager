"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { personMilestones, user } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { isManagerOrAbove } from "@/lib/policy";
import { parseForm, type ActionResult } from "@/lib/action-utils";

// Anti-manipulation: due dates are commitments — date-part compare, and only
// manager rank moves an existing one (defense-in-depth; the capability is
// manager-fixed already, but survives any future loosening).
const sameDay = (a: Date, b: Date) =>
  a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
const DATE_LOCKED =
  "Due dates are locked once set — ask a manager to move it deliberately.";

function revalidate() {
  revalidatePath("/admin/users");
  revalidatePath("/account");
  revalidatePath("/"); // fight list + nav badge
}

async function ensureManage(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("personMilestone.manage")) {
    return { ok: false, error: "Only lab leadership manages thesis milestones." };
  }
  return { ok: true };
}

const addSchema = z.object({
  userId: z.string().min(1),
  title: z.string().trim().min(1, "Name the milestone."),
  dueDate: z.coerce.date({ error: "A due date is required — milestones without dates drift." }),
  note: z.string().trim().default(""),
});

export async function addPersonMilestone(formData: FormData): Promise<ActionResult> {
  const gate = await ensureManage();
  if (!gate.ok) return { error: gate.error };

  const parsed = parseForm(addSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const target = await db.select().from(user).where(eq(user.id, parsed.data.userId)).get();
  if (!target || target.banned) return { error: "That account is not available." };

  await db.insert(personMilestones).values({
    userId: parsed.data.userId,
    title: parsed.data.title,
    dueDate: parsed.data.dueDate,
    note: parsed.data.note || null,
  });
  revalidate();
  return {};
}

export async function completePersonMilestone(id: string): Promise<ActionResult> {
  const gate = await ensureManage();
  if (!gate.ok) return { error: gate.error };

  const row = await db.select().from(personMilestones).where(eq(personMilestones.id, id)).get();
  if (!row) return { error: "Milestone not found." };
  if (row.status !== "PLANNED") return { error: "This milestone is already closed." };

  await db
    .update(personMilestones)
    .set({ status: "DONE", closedAt: new Date() })
    .where(eq(personMilestones.id, id));
  revalidate();
  return {};
}

export async function cancelPersonMilestone(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const gate = await ensureManage();
  if (!gate.ok) return { error: gate.error };

  const row = await db.select().from(personMilestones).where(eq(personMilestones.id, id)).get();
  if (!row) return { error: "Milestone not found." };
  if (row.status !== "PLANNED") return { error: "This milestone is already closed." };

  const note = String(formData.get("note") ?? "").trim();
  await db
    .update(personMilestones)
    .set({ status: "CANCELLED", closedAt: new Date(), note: note || row.note })
    .where(eq(personMilestones.id, id));
  revalidate();
  return {};
}

const editSchema = z.object({
  title: z.string().trim().min(1, "Name the milestone."),
  dueDate: z.coerce.date({ error: "A due date is required." }),
  note: z.string().trim().default(""),
});

export async function editPersonMilestone(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("personMilestone.manage")) {
    return { error: "Only lab leadership manages thesis milestones." };
  }

  const parsed = parseForm(editSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const row = await db.select().from(personMilestones).where(eq(personMilestones.id, id)).get();
  if (!row) return { error: "Milestone not found." };
  if (row.status !== "PLANNED") return { error: "This milestone is closed." };

  if (!sameDay(parsed.data.dueDate, row.dueDate) && !isManagerOrAbove(me)) {
    return { error: DATE_LOCKED };
  }

  await db
    .update(personMilestones)
    .set({
      title: parsed.data.title,
      dueDate: parsed.data.dueDate,
      note: parsed.data.note || null,
    })
    .where(eq(personMilestones.id, id));
  revalidate();
  return {};
}
