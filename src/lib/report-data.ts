import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  blockers,
  milestones,
  papers,
  projectPeople,
  projects,
  stateTransitions,
  updates,
} from "@/lib/db/schema";
import { user } from "@/lib/db/auth-schema";

/**
 * Everything a per-project report needs, in one load. Same visibility
 * surface as the project page — callers guard with canAccessProject.
 */
export async function loadProjectReport(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      owner: { columns: { name: true } },
      advisor: { columns: { name: true } },
    },
  });
  if (!project) return null;

  const [lineup, milestoneRows, blockerRows, updateRows, paperRows, transitionRows] =
    await Promise.all([
      db.query.projectPeople.findMany({
        where: eq(projectPeople.projectId, projectId),
        with: {
          user: { columns: { name: true } },
          utfStudent: { columns: { name: true } },
        },
        orderBy: asc(projectPeople.createdAt),
      }),
      db
        .select()
        .from(milestones)
        .where(eq(milestones.projectId, projectId))
        .orderBy(asc(milestones.dueDate)),
      db
        .select()
        .from(blockers)
        .where(eq(blockers.projectId, projectId))
        .orderBy(desc(blockers.createdAt)),
      db
        .select({
          whatMoved: updates.whatMoved,
          whatsNext: updates.whatsNext,
          createdAt: updates.createdAt,
          authorName: user.name,
        })
        .from(updates)
        .leftJoin(user, eq(updates.authorId, user.id))
        .where(eq(updates.projectId, projectId))
        .orderBy(desc(updates.createdAt)),
      db
        .select()
        .from(papers)
        .where(eq(papers.projectId, projectId))
        .orderBy(desc(papers.createdAt)),
      db
        .select({
          fromState: stateTransitions.fromState,
          toState: stateTransitions.toState,
          reason: stateTransitions.reason,
          createdAt: stateTransitions.createdAt,
          byName: user.name,
        })
        .from(stateTransitions)
        .leftJoin(user, eq(stateTransitions.byUserId, user.id))
        .where(eq(stateTransitions.projectId, projectId))
        .orderBy(desc(stateTransitions.createdAt)),
    ]);

  return {
    project,
    lineup,
    milestones: milestoneRows,
    blockers: blockerRows,
    updates: updateRows,
    papers: paperRows,
    transitions: transitionRows,
  };
}

export type ProjectReport = NonNullable<Awaited<ReturnType<typeof loadProjectReport>>>;
