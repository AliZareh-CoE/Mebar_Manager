"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { tasks, user } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { canAccessProject } from "@/lib/visibility";
import { isManagerOrAbove } from "@/lib/policy";
import { logAudit } from "@/lib/audit";

function revalidateTask(projectId?: string | null) {
  revalidatePath("/");
  revalidatePath("/tasks");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

async function verifySecretary(userId: string): Promise<string | null> {
  const target = await db.select().from(user).where(eq(user.id, userId)).get();
  if (!target || target.banned) return "That account is not available.";
  if (target.role !== "SECRETARY") return "That person is not a secretary.";
  return null;
}

const fileTaskSchema = z.object({
  title: z.string().trim().min(1, "What needs doing?"),
  description: z.string().trim().default(""),
  deadline: z.coerce.date({ error: "A deadline is required — tasks without dates rot" }),
  assigneeId: z.string().optional(),
  projectId: z.string().optional(),
});

export async function fileTask(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(fileTaskSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const assigneeId = parsed.data.assigneeId || null;
  if (assigneeId) {
    const problem = await verifySecretary(assigneeId);
    if (problem) return { error: problem };
  }

  // An optional project link — only to projects the filer can see.
  const projectId = parsed.data.projectId || null;
  if (projectId && !(await canAccessProject(me, projectId))) {
    return { error: "Project not found." };
  }

  await db.insert(tasks).values({
    title: parsed.data.title,
    description: parsed.data.description,
    deadline: parsed.data.deadline,
    requesterId: me.id,
    assigneeId,
    projectId,
  });

  revalidateTask(projectId);
  return {};
}

export async function assignTask(
  taskId: string,
  assigneeId: string
): Promise<ActionResult> {
  const me = await requireUser();

  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) return { error: "Task not found." };
  if (task.status !== "OPEN") return { error: "This task is closed." };

  const policy = await getPolicy(me);
  const selfClaim = me.role === "SECRETARY" && assigneeId === me.id;
  if (
    !selfClaim &&
    !policy.can("task.edit", { involvedUserIds: [task.requesterId, task.assigneeId] })
  ) {
    return { error: "Only the requester, a manager, or a self-claiming secretary can assign this." };
  }

  const problem = await verifySecretary(assigneeId);
  if (problem) return { error: problem };

  await db.update(tasks).set({ assigneeId }).where(eq(tasks.id, taskId));
  revalidateTask(task.projectId);
  return {};
}

export async function completeTask(
  taskId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const completionNote = String(formData.get("completionNote") ?? "").trim();
  if (!completionNote) {
    return { error: "Say what was done — one line is enough." };
  }

  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) return { error: "Task not found." };
  if (task.status !== "OPEN") return { error: "This task is closed." };

  const policy = await getPolicy(me);
  if (!policy.can("task.edit", { involvedUserIds: [task.assigneeId, task.requesterId] })) {
    return { error: "Only the assigned secretary (or the requester/a manager) can complete this." };
  }

  await db
    .update(tasks)
    .set({ status: "DONE", completionNote, completedAt: new Date() })
    .where(eq(tasks.id, taskId));

  revalidateTask(task.projectId);
  return {};
}

// Deadlines feed the on-time scoring bonus — once set, only manager rank
// may move them. Date-part comparison: stored values may carry a time of
// day, and an untouched date field must never read as a change.
const sameDay = (a: Date, b: Date) =>
  a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
const DATE_LOCKED =
  "Deadlines are locked once set — they feed the scoring. Ask a coordinator to move it.";

const editTaskSchema = z.object({
  title: z.string().trim().min(1, "What needs doing?"),
  description: z.string().trim().default(""),
  deadline: z.coerce.date({ error: "A deadline is required" }),
  assigneeId: z.string().optional(),
});

export async function editTask(
  taskId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(editTaskSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) return { error: "Task not found." };
  if (task.status !== "OPEN") return { error: "This task is closed." };

  const policy = await getPolicy(me);
  if (!policy.can("task.edit", { involvedUserIds: [task.requesterId, task.assigneeId] })) {
    return { error: "You don't have permission to edit this task." };
  }
  if (!sameDay(parsed.data.deadline, task.deadline) && !isManagerOrAbove(me)) {
    return { error: DATE_LOCKED };
  }

  // Only touch the assignee when the form actually sent the field.
  const assigneeSent = formData.has("assigneeId");
  const assigneeId = assigneeSent ? parsed.data.assigneeId || null : task.assigneeId;
  if (assigneeSent && assigneeId && assigneeId !== task.assigneeId) {
    const problem = await verifySecretary(assigneeId);
    if (problem) return { error: problem };
  }

  await db
    .update(tasks)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      deadline: parsed.data.deadline,
      assigneeId,
    })
    .where(eq(tasks.id, taskId));

  revalidateTask(task.projectId);
  if (!sameDay(parsed.data.deadline, task.deadline)) {
    void logAudit(me.id, "task.dateMove", "task", taskId,
      `Moved deadline on "${task.title}"`, { from: task.deadline, to: parsed.data.deadline });
  }
  return {};
}

export async function cancelTask(
  taskId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why the task is no longer needed." };

  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) return { error: "Task not found." };
  if (task.status !== "OPEN") return { error: "This task is already closed." };

  const policy = await getPolicy(me);
  if (!policy.can("task.cancel", { involvedUserIds: [task.requesterId, task.assigneeId] })) {
    return { error: "You don't have permission to cancel this task." };
  }

  await db
    .update(tasks)
    .set({ status: "CANCELLED", completionNote: reason, completedAt: new Date() })
    .where(eq(tasks.id, taskId));

  revalidateTask(task.projectId);
  return {};
}
