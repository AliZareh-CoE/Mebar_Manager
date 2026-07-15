"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { decisions, projects } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { canAccessProject } from "@/lib/visibility";

function revalidateDecision(projectId: string) {
  revalidatePath("/");
  revalidatePath(`/projects/${projectId}`);
}

const requestDecisionSchema = z.object({
  question: z.string().trim().min(1, "What's the fork in the road?"),
  options: z.string().trim().min(1, "List the options, one per line"),
  recommendation: z.string().trim().min(1, "Your recommendation is required — it's what happens if nobody answers"),
});

export async function requestDecision(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  if (!(await canAccessProject(me, projectId))) return { error: "Project not found." };

  const parsed = parseForm(requestDecisionSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return { error: "Project not found." };

  await db.insert(decisions).values({
    projectId,
    requestedFromId: project.advisorId,
    ...parsed.data,
  });

  revalidateDecision(projectId);
  return {};
}

export async function decideDecision(
  decisionId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const policy = await getPolicy(user);
  if (!policy.can("decision.decide")) return { error: "Only a manager can decide." };

  const decisionNote = String(formData.get("decisionNote") ?? "");
  const decision = await db.select().from(decisions).where(eq(decisions.id, decisionId)).get();
  if (!decision) return { error: "Decision not found." };
  if (decision.status !== "PENDING") return { error: "This decision is already settled." };
  if (!decisionNote.trim()) return { error: "Write the decision — one line is enough." };

  await db
    .update(decisions)
    .set({
      status: "DECIDED",
      decidedById: user.id,
      decisionNote: decisionNote.trim(),
      decidedAt: new Date(),
    })
    .where(eq(decisions.id, decisionId));

  revalidateDecision(decision.projectId);
  return {};
}

export async function editDecision(
  decisionId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const parsed = parseForm(requestDecisionSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const decision = await db.select().from(decisions).where(eq(decisions.id, decisionId)).get();
  if (!decision) return { error: "Decision not found." };
  if (decision.status !== "PENDING") return { error: "This decision is already settled." };

  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, decision.projectId))
    .get();

  const policy = await getPolicy(me);
  if (
    !policy.can("decision.cancel", {
      involvedUserIds: [project?.ownerId, project?.advisorId],
    })
  ) {
    return { error: "You don't have permission to edit this decision." };
  }

  await db.update(decisions).set(parsed.data).where(eq(decisions.id, decisionId));
  revalidateDecision(decision.projectId);
  return {};
}

export async function cancelDecision(
  decisionId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why the question no longer needs an answer." };

  const decision = await db.select().from(decisions).where(eq(decisions.id, decisionId)).get();
  if (!decision) return { error: "Decision not found." };
  if (decision.status !== "PENDING") return { error: "This decision is already settled." };

  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, decision.projectId))
    .get();

  const policy = await getPolicy(me);
  if (
    !policy.can("decision.cancel", {
      involvedUserIds: [project?.ownerId, project?.advisorId],
    })
  ) {
    return { error: "You don't have permission to withdraw this decision." };
  }

  await db
    .update(decisions)
    .set({ status: "CANCELLED", decisionNote: reason, decidedAt: new Date() })
    .where(eq(decisions.id, decisionId));

  revalidateDecision(decision.projectId);
  return {};
}
