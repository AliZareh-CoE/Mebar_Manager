"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, stateTransitions, projectPeople, papers } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { getPolicy, transitionGate } from "@/lib/policy-server";
import { isLabLeadership } from "@/lib/policy";
import { missingRoleLabels } from "@/lib/project-people";
import {
  applyEvent,
  initialStateKey,
  stateByKey,
  isActivationTransition,
  KEY_RE,
} from "@/lib/workflow";
import { collectProposalAnswers } from "@/lib/proposal";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { canAccessProject } from "@/lib/visibility";
import { notifyProjectEvent } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

function revalidateProject(id: string) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/projects/${id}`);
}

const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().default(""),
  ownerId: z.string().min(1, "Owner is required"),
  advisorId: z.string().min(1, "Advisor is required"),
});

export async function createProject(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("project.create")) {
    return { error: "You don't have permission to create projects." };
  }

  const parsed = parseForm(createProjectSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const settings = await getSettings();
  // Proposal answers: built-ins map to columns, customs to extraAnswers.
  const answers = collectProposalAnswers(settings.proposalQuestions, formData);
  const [project] = await db
    .insert(projects)
    .values({
      ...parsed.data,
      ...answers.columns,
      extraAnswers: answers.extraAnswers,
      createdById: me.id,
      state: initialStateKey(settings.workflow),
    })
    .returning();
  revalidatePath("/board");
  redirect(`/projects/${project.id}`);
}

const editProjectSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().default(""),
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

  const settings = await getSettings();
  // Archived questions and absent fields keep their stored answers.
  const answers = collectProposalAnswers(
    settings.proposalQuestions,
    formData,
    project.extraAnswers
  );
  await db
    .update(projects)
    .set({ ...parsed.data, ...answers.columns, extraAnswers: answers.extraAnswers })
    .where(eq(projects.id, projectId));
  revalidateProject(projectId);
  return {};
}

const adminSetStateSchema = z.object({
  toState: z.string().regex(KEY_RE),
  reason: z.string().trim().optional(),
});

/**
 * ADMIN-only escape hatch: put a project in ANY workflow state directly,
 * skipping the transition map, the activation lineup checkpoint, and the
 * accepted-paper completion gate. The move still lands in the transition
 * history, the audit log, and watcher emails — full power, full paper trail.
 */
export async function adminSetProjectState(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return { error: "Only the admin can override project states." };
  }

  const parsed = parseForm(adminSetStateSchema, formData);
  if (!parsed.success) return { error: parsed.error };
  const { toState, reason } = parsed.data;

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return { error: "Project not found." };

  const { workflow } = await getSettings();
  const target = stateByKey(workflow, toState);
  if (!target) return { error: "Unknown workflow state." };
  if (project.state === toState) return { error: "The project is already in that state." };

  const targetPaused = target.flags.paused;
  let raced = false;
  db.transaction((tx) => {
    const updated = tx
      .update(projects)
      .set({
        state: toState,
        pauseReason: targetPaused ? (reason ?? "Admin override") : null,
        reviveDate: null,
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
        toState,
        byUserId: user.id,
        reason: reason ? `Admin override: ${reason}` : "Admin override",
      })
      .run();
  });
  if (raced) {
    return { error: "The project's state just changed — refresh and try again." };
  }

  revalidateProject(projectId);
  void logAudit(
    user.id,
    "project.transition",
    "project",
    projectId,
    `${project.state} → ${toState} (admin override)`,
    { fromState: project.state, toState, reason: reason ?? null, adminOverride: true }
  );
  void notifyProjectEvent(projectId, {
    title: `Now ${target.label}`,
    lines: [
      `${project.state} → ${toState}, set directly by ${user.name} (admin).`,
      ...(reason ? [`Reason: ${reason}`] : []),
    ],
  });
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

  const { workflow } = await getSettings();
  const policy = await getPolicy(user);
  const result = applyEvent(
    workflow,
    project.state,
    { type, pauseReason, reviveDate, now: new Date() },
    transitionGate(user, policy)
  );
  if (!result.ok) return { error: result.error };

  // Activation checkpoint: entering an active state from a non-active one
  // requires (1) leadership — researchers file, coordinators activate — and
  // (2) a complete lineup. Checked outside the write transaction like the
  // rest of the validation; a lineup edit racing the transition can slip
  // through, and MISSING_PROJECT_PEOPLE self-heals it — do not "fix" this
  // into the transaction.
  if (isActivationTransition(workflow, result.transition)) {
    if (!isLabLeadership(user)) {
      return { error: "Only a coordinator or manager can activate a project — ask one to start it." };
    }
    const lineup = await db
      .select({ role: projectPeople.role })
      .from(projectPeople)
      .where(eq(projectPeople.projectId, projectId));
    const missing = missingRoleLabels(lineup);
    if (missing.length > 0) {
      const stateLabel = stateByKey(workflow, result.next)?.label ?? result.next;
      return {
        error: `Can't move to ${stateLabel}: this project needs ${missing.join(" and ")} first (People tab).`,
      };
    }
  }

  // Completion checkpoint: a project is finished when its paper is
  // ACCEPTED — that's the whole point of the project. A non-destructive
  // transition into a terminal state (Mark done) is blocked without one;
  // Kill (destructive, with a reason) stays the only other exit.
  const targetTerminal = stateByKey(workflow, result.next)?.flags.terminal ?? false;
  if (targetTerminal && !result.transition.destructive) {
    const accepted = await db
      .select({ id: papers.id })
      .from(papers)
      .where(and(eq(papers.projectId, projectId), eq(papers.status, "ACCEPTED")))
      .get();
    if (!accepted) {
      return {
        error:
          "A project is finished when its paper is accepted — no accepted paper, no Done. Keep fighting, or Kill it with a reason.",
      };
    }
  }

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
  void logAudit(
    user.id,
    "project.transition",
    "project",
    projectId,
    `${project.state} → ${result.next}`,
    { fromState: project.state, toState: result.next, reason: reason ?? pauseReason ?? null }
  );
  // Watchers get big events only; fire-and-forget after the commit.
  const targetLabel = stateByKey(workflow, result.next)?.label ?? result.next;
  void notifyProjectEvent(projectId, {
    title: `Now ${targetLabel}`,
    lines: [
      `${project.state} → ${result.next}, by ${user.name}.`,
      ...(targetPaused && pauseReason ? [`Reason: ${pauseReason}`] : []),
      ...(!targetPaused && reason ? [`Reason: ${reason}`] : []),
    ],
  });
  return {};
}
