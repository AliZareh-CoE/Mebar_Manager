"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, stateTransitions } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy, transitionGate } from "@/lib/policy-server";
import { applyEvent, initialStateKey, stateByKey, KEY_RE } from "@/lib/workflow";
import { DEFAULT_WORKFLOW } from "@/lib/settings-defaults";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { canAccessProject } from "@/lib/visibility";

function revalidateProject(id: string) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/projects/${id}`);
}

const heilmeierFields = {
  objective: z.string().trim().default(""),
  howItsDoneToday: z.string().trim().default(""),
  whatsNew: z.string().trim().default(""),
  whoCares: z.string().trim().default(""),
  risks: z.string().trim().default(""),
  killCriteria: z.string().trim().default(""),
  successCriteria: z.string().trim().default(""),
};

const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().default(""),
  ownerId: z.string().min(1, "Owner is required"),
  advisorId: z.string().min(1, "Advisor is required"),
  ...heilmeierFields,
});

export async function createProject(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("project.create")) {
    return { error: "You don't have permission to create projects." };
  }

  const parsed = parseForm(createProjectSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const [project] = await db
    .insert(projects)
    .values({ ...parsed.data, createdById: me.id, state: initialStateKey(DEFAULT_WORKFLOW) })
    .returning();
  revalidatePath("/board");
  redirect(`/projects/${project.id}`);
}

const editProjectSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().default(""),
  ...heilmeierFields,
});

export async function editProject(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return { error: "Project not found." };
  if (!(await canAccessProject(user, projectId))) return { error: "Project not found." };
  const policy = await getPolicy(user);
  if (!policy.can("project.editAny", { involvedUserIds: [project.ownerId, project.advisorId] })) {
    return { error: "Only the owner or advisor can edit this project." };
  }

  const parsed = parseForm(editProjectSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.update(projects).set(parsed.data).where(eq(projects.id, projectId));
  revalidateProject(projectId);
  return {};
}

const fireEventSchema = z.object({
  type: z.string().regex(KEY_RE),
  reason: z.string().trim().optional(),
  pauseReason: z.string().trim().optional(),
  reviveDate: z.coerce.date().optional(),
});

export async function fireProjectEvent(
  projectId: string,
  input: {
    type: string;
    reason?: string;
    pauseReason?: string;
    reviveDate?: string;
  }
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = fireEventSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid transition." };
  const { type, reason, pauseReason, reviveDate } = parsed.data;

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return { error: "Project not found." };
  if (!(await canAccessProject(user, projectId))) return { error: "Project not found." };

  const workflow = DEFAULT_WORKFLOW;
  const policy = await getPolicy(user);
  const result = applyEvent(
    workflow,
    project.state,
    { type, pauseReason, reviveDate, now: new Date() },
    transitionGate(user, policy)
  );
  if (!result.ok) return { error: result.error };

  // The pause columns belong to paused-flagged states only; entering any
  // other state clears them.
  const targetPaused = stateByKey(workflow, result.next)?.flags.paused ?? false;

  // Guard against a concurrent transition between our read and this write:
  // the UPDATE only applies if the project is still in the state we
  // validated from. Zero rows changed = someone else moved it first.
  let raced = false;
  db.transaction((tx) => {
    const updated = tx
      .update(projects)
      .set({
        state: result.next,
        pauseReason: targetPaused ? (pauseReason ?? null) : null,
        reviveDate: targetPaused ? (reviveDate ?? null) : null,
      })
      .where(and(eq(projects.id, projectId), eq(projects.state, project.state)))
      .run();
    if (updated.changes === 0) {
      raced = true;
      return;
    }
    tx.insert(stateTransitions)
      .values({
        projectId,
        fromState: project.state,
        toState: result.next,
        byUserId: user.id,
        reason: targetPaused ? (pauseReason ?? null) : (reason ?? null),
      })
      .run();
  });
  if (raced) {
    return { error: "The project's state just changed — refresh and try again." };
  }

  revalidateProject(projectId);
  return {};
}
