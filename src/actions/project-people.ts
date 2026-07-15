"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projects, projectPeople, user } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";
import { canAccessProject } from "@/lib/visibility";
import { planRoleAssignment, type PersonPick } from "@/lib/project-people";
import type { SessionUser } from "@/lib/session";

function revalidateLineup(projectId: string) {
  revalidatePath("/");
  revalidatePath(`/projects/${projectId}`);
}

/** Shared guard: project exists, viewer may see it, viewer may edit lineups. */
async function verifyLineupAccess(
  me: SessionUser,
  projectId: string
): Promise<{ error: string } | { ok: true }> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return { error: "Project not found." };
  if (!(await canAccessProject(me, projectId))) return { error: "Project not found." };
  const policy = await getPolicy(me);
  if (
    !policy.can("projectPeople.edit", {
      involvedUserIds: [project.ownerId, project.advisorId, project.createdById],
    })
  ) {
    return { error: "You don't have permission to edit this project's people." };
  }
  return { ok: true };
}

// Member XOR external: `userId` set means a lab member; otherwise
// externalName is required. The form submits one or the other.
const personFieldsSchema = z
  .object({
    userId: z.string().trim().default(""),
    externalName: z.string().trim().default(""),
    affiliation: z.string().trim().default(""),
    title: z.string().trim().default(""),
    email: z.union([z.literal(""), z.string().trim().pipe(z.email("Invalid email"))]).default(""),
  })
  .refine((v) => (v.userId === "") !== (v.externalName === ""), {
    message: "Pick a lab member or enter an external name — one or the other.",
  });

function toPick(v: { userId: string; externalName: string }): PersonPick {
  return v.userId !== ""
    ? { kind: "member", userId: v.userId }
    : { kind: "external", externalName: v.externalName };
}

async function verifyMember(userId: string): Promise<string | null> {
  const target = await db.select().from(user).where(eq(user.id, userId)).get();
  if (!target || target.banned) return "That account is not available.";
  return null;
}

const setRoleSchema = personFieldsSchema.safeExtend({
  role: z.enum(["PI", "FIRST_AUTHOR"]),
});

/**
 * Make someone the PI or first author. Swap semantics: the previous holder
 * is demoted to CONTRIBUTOR (staying on the lineup), and a person already
 * on the lineup is promoted in place instead of duplicated.
 */
export async function setProjectRole(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  const access = await verifyLineupAccess(me, projectId);
  if ("error" in access) return access;

  const parsed = parseForm(setRoleSchema, formData);
  if (!parsed.success) return { error: parsed.error };
  const { role } = parsed.data;
  if (parsed.data.userId) {
    const problem = await verifyMember(parsed.data.userId);
    if (problem) return { error: problem };
  }

  const rows = await db
    .select()
    .from(projectPeople)
    .where(eq(projectPeople.projectId, projectId));
  const plan = planRoleAssignment(rows, role, toPick(parsed.data));

  db.transaction((tx) => {
    if (plan.demoteRowId) {
      tx.update(projectPeople)
        .set({ role: "CONTRIBUTOR" })
        .where(eq(projectPeople.id, plan.demoteRowId))
        .run();
    }
    if (plan.op === "promote") {
      tx.update(projectPeople).set({ role }).where(eq(projectPeople.id, plan.rowId)).run();
    } else {
      tx.insert(projectPeople)
        .values({
          projectId,
          userId: parsed.data.userId || null,
          externalName: parsed.data.externalName || null,
          affiliation: parsed.data.affiliation || null,
          role,
          title: parsed.data.title,
          email: parsed.data.email || null,
        })
        .run();
    }
  });

  revalidateLineup(projectId);
  return {};
}

/** Add a contributor (member or external) to the lineup. */
export async function addContributor(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireUser();
  const access = await verifyLineupAccess(me, projectId);
  if ("error" in access) return access;

  const parsed = parseForm(personFieldsSchema, formData);
  if (!parsed.success) return { error: parsed.error };
  if (parsed.data.userId) {
    const problem = await verifyMember(parsed.data.userId);
    if (problem) return { error: problem };
    const dupe = await db
      .select({ id: projectPeople.id })
      .from(projectPeople)
      .where(
        and(eq(projectPeople.projectId, projectId), eq(projectPeople.userId, parsed.data.userId))
      )
      .get();
    if (dupe) return { error: "They're already on this project." };
  }

  await db.insert(projectPeople).values({
    projectId,
    userId: parsed.data.userId || null,
    externalName: parsed.data.externalName || null,
    affiliation: parsed.data.affiliation || null,
    role: "CONTRIBUTOR",
    title: parsed.data.title,
    email: parsed.data.email || null,
  });

  revalidateLineup(projectId);
  return {};
}

/**
 * Remove someone from the lineup. A plain delete — lineup rows are
 * current-state metadata, not history (the commented exception to the
 * no-hard-deletes rule). Removing the PI or first author re-opens the
 * MISSING_PROJECT_PEOPLE fight on active projects.
 */
export async function removeProjectPerson(personId: string): Promise<ActionResult> {
  const me = await requireUser();
  const row = await db
    .select()
    .from(projectPeople)
    .where(eq(projectPeople.id, personId))
    .get();
  if (!row) return { error: "Not on the lineup." };
  const access = await verifyLineupAccess(me, row.projectId);
  if ("error" in access) return access;

  await db.delete(projectPeople).where(eq(projectPeople.id, personId));
  revalidateLineup(row.projectId);
  return {};
}

/** Toggle big-event email notifications for a lineup row. */
export async function toggleNotify(personId: string): Promise<ActionResult> {
  const me = await requireUser();
  const row = await db
    .select()
    .from(projectPeople)
    .where(eq(projectPeople.id, personId))
    .get();
  if (!row) return { error: "Not on the lineup." };
  const access = await verifyLineupAccess(me, row.projectId);
  if ("error" in access) return access;

  await db
    .update(projectPeople)
    .set({ notify: !row.notify })
    .where(eq(projectPeople.id, personId));
  revalidateLineup(row.projectId);
  return {};
}
