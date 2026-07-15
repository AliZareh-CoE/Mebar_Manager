"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, papers, PAPER_STATUSES } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { canAccessProject } from "@/lib/visibility";
import {
  canTransitionPaper,
  transitionRequirements,
  transitionColumns,
  PAPER_STATUS_LABELS,
} from "@/lib/papers";
import type { SessionUser } from "@/lib/session";

function revalidatePaper(projectId: string) {
  revalidatePath("/");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/performance");
}

async function verifyPaperAccess(
  me: SessionUser,
  projectId: string,
  paperCreatedById?: string | null
): Promise<{ error: string } | { ok: true }> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return { error: "Project not found." };
  if (!(await canAccessProject(me, projectId))) return { error: "Project not found." };
  const policy = await getPolicy(me);
  if (
    !policy.can("paper.edit", {
      involvedUserIds: [project.ownerId, project.advisorId, project.createdById, paperCreatedById],
    })
  ) {
    return { error: "You don't have permission to edit this project's papers." };
  }
  return { ok: true };
}

const filePaperSchema = z.object({
  title: z.string().trim().min(1, "The paper needs a working title"),
  venue: z.string().trim().default(""),
  quartileNote: z.string().trim().default(""),
  link: z.string().trim().default(""),
});

export async function filePaper(projectId: string, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const access = await verifyPaperAccess(me, projectId);
  if ("error" in access) return access;

  const parsed = parseForm(filePaperSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.insert(papers).values({ ...parsed.data, projectId, createdById: me.id });
  revalidatePaper(projectId);
  return {};
}

export async function editPaper(paperId: string, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const paper = await db.select().from(papers).where(eq(papers.id, paperId)).get();
  if (!paper) return { error: "Paper not found." };
  const access = await verifyPaperAccess(me, paper.projectId, paper.createdById);
  if ("error" in access) return access;

  const parsed = parseForm(filePaperSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.update(papers).set(parsed.data).where(eq(papers.id, paperId));
  revalidatePaper(paper.projectId);
  return {};
}

const transitionPaperSchema = z.object({
  to: z.enum(PAPER_STATUSES),
  venue: z.string().trim().default(""),
  closureNote: z.string().trim().default(""),
});

export async function transitionPaper(
  paperId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  const paper = await db.select().from(papers).where(eq(papers.id, paperId)).get();
  if (!paper) return { error: "Paper not found." };
  const access = await verifyPaperAccess(me, paper.projectId, paper.createdById);
  if ("error" in access) return access;

  const parsed = parseForm(transitionPaperSchema, formData);
  if (!parsed.success) return { error: parsed.error };
  const { to, venue, closureNote } = parsed.data;

  if (!canTransitionPaper(paper.status, to)) {
    return {
      error: `A ${PAPER_STATUS_LABELS[paper.status].toLowerCase()} paper can't move to ${PAPER_STATUS_LABELS[to].toLowerCase()}.`,
    };
  }
  const needs = transitionRequirements(to);
  if (needs.needsVenue && !venue && !paper.venue) {
    return { error: "Where is it being submitted? A submission needs a venue." };
  }
  if (needs.needsClosureNote && !closureNote) {
    return { error: "The reason goes on the record." };
  }

  await db
    .update(papers)
    .set(transitionColumns(to, new Date(), { venue, closureNote }))
    .where(eq(papers.id, paperId));
  revalidatePaper(paper.projectId);
  return {};
}
