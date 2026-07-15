"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { decisions, projects } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";

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
  await requireUser();

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
