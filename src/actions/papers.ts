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
import { notifyProjectEvent } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { isManagerOrAbove } from "@/lib/policy";
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
  // Empty string clears the target; a value coerces to a Date.
  targetSubmissionAt: z
    .union([z.literal(""), z.coerce.date()])
    .default("")
    .transform((v) => (v === "" ? null : v)),
  venueShortlist: z
    .array(z.string().trim())
    .transform((xs) => xs.filter(Boolean).slice(0, 3))
    .default([]),
});

// parseForm keeps only the last value per key (Object.fromEntries), so the
// repeated venueShortlist inputs are collected with getAll.
function paperFormData(formData: FormData) {
  return {
    ...Object.fromEntries(formData.entries()),
    venueShortlist: formData.getAll("venueShortlist").map(String),
  };
}

// The target date is a commitment: setting it the first time is filing it
// (allowed); moving or clearing an existing one is manager-rank territory —
// the same anti-manipulation spirit as data-request needed-by dates.
const sameDay = (a: Date, b: Date) =>
  a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
const TARGET_LOCKED =
  "Submission target dates are locked once set. Ask a coordinator to move it.";

export async function filePaper(projectId: string, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const access = await verifyPaperAccess(me, projectId);
  if ("error" in access) return access;

  const parsed = filePaperSchema.safeParse(paperFormData(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

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

  const parsed = filePaperSchema.safeParse(paperFormData(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const prev = paper.targetSubmissionAt;
  const next = parsed.data.targetSubmissionAt;
  const targetChanged =
    (prev === null) !== (next === null) ||
    (prev !== null && next !== null && !sameDay(prev, next));
  if (prev !== null && targetChanged && !isManagerOrAbove(me)) {
    return { error: TARGET_LOCKED };
  }

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
  // An acceptance is the pointing system's biggest prize — a coordinator
  // confirms it, not the person who earns the points.
  if (to === "ACCEPTED" && !isManagerOrAbove(me)) {
    return { error: "An acceptance is confirmed by a coordinator — ask one to mark it." };
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
  if (to === "ACCEPTED") {
    void logAudit(me.id, "paper.accepted", "paper", paperId,
      `Confirmed acceptance${venue || paper.venue ? ` at ${venue || paper.venue}` : ""}`,
      { projectId: paper.projectId });
  }
  void notifyProjectEvent(paper.projectId, {
    title: `Paper ${PAPER_STATUS_LABELS[to].toLowerCase()}`,
    lines: [
      `"${paper.title}"${venue || paper.venue ? ` — ${venue || paper.venue}` : ""}.`,
      ...(closureNote ? [`Note: ${closureNote}`] : []),
    ],
  });
  return {};
}
