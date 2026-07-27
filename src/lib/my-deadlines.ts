import "server-only";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  computeRequests,
  dataRequests,
  initiatives,
  milestones,
  papers,
  personMilestones,
  projects,
  tasks,
} from "@/lib/db/schema";

/**
 * One person's dated obligations, shared by the "Your week" panel and the
 * personal ICS calendar feed. Everything here is something THEY are on the
 * hook for (or filed and are waiting on) — not the whole lab's calendar.
 */

export type DeadlineItem = {
  uid: string;
  date: Date;
  summary: string;
  href: string;
};

export async function loadMyDeadlines(userId: string): Promise<DeadlineItem[]> {
  const myProjects = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(or(eq(projects.ownerId, userId), eq(projects.advisorId, userId)));
  const projectIds = myProjects.map((p) => p.id);
  const titleOf = new Map(myProjects.map((p) => [p.id, p.title]));

  const [ms, ts, drs, pps, inis, pms, crs] = await Promise.all([
    projectIds.length
      ? db
          .select()
          .from(milestones)
          .where(
            and(
              inArray(milestones.projectId, projectIds),
              inArray(milestones.status, ["PLANNED", "IN_PROGRESS"])
            )
          )
      : Promise.resolve([]),
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "OPEN"),
          or(eq(tasks.assigneeId, userId), eq(tasks.requesterId, userId))
        )
      ),
    db
      .select()
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.status, "OPEN"),
          or(eq(dataRequests.assigneeId, userId), eq(dataRequests.requesterId, userId))
        )
      ),
    projectIds.length
      ? db
          .select()
          .from(papers)
          .where(
            and(
              inArray(papers.projectId, projectIds),
              eq(papers.status, "DRAFTING"),
              isNotNull(papers.targetSubmissionAt)
            )
          )
      : Promise.resolve([]),
    db
      .select()
      .from(initiatives)
      .where(and(eq(initiatives.status, "OPEN"), eq(initiatives.assigneeId, userId))),
    db
      .select()
      .from(personMilestones)
      .where(and(eq(personMilestones.userId, userId), eq(personMilestones.status, "PLANNED"))),
    db
      .select()
      .from(computeRequests)
      .where(
        and(
          eq(computeRequests.requesterId, userId),
          eq(computeRequests.status, "APPROVED"),
          isNotNull(computeRequests.windowEnd)
        )
      ),
  ]);

  const items: DeadlineItem[] = [
    ...ms.map((m) => ({
      uid: `milestone-${m.id}`,
      date: m.dueDate,
      summary: `Milestone: ${m.title} — ${titleOf.get(m.projectId) ?? ""}`,
      href: `/projects/${m.projectId}`,
    })),
    ...ts.map((t) => ({
      uid: `task-${t.id}`,
      date: t.deadline,
      summary: `Task: ${t.title}`,
      href: "/tasks",
    })),
    ...drs.map((dr) => ({
      uid: `data-${dr.id}`,
      date: dr.neededBy,
      summary: `Data request: ${dr.title}`,
      href: "/data",
    })),
    ...pps.map((p) => ({
      uid: `paper-${p.id}`,
      date: p.targetSubmissionAt as Date,
      summary: `Paper target: ${p.title}`,
      href: `/projects/${p.projectId}`,
    })),
    ...inis.map((i) => ({
      uid: `initiative-${i.id}`,
      date: i.deadline,
      summary: `Initiative: ${i.title}`,
      href: "/initiatives",
    })),
    ...pms.map((pm) => ({
      uid: `person-milestone-${pm.id}`,
      date: pm.dueDate,
      summary: `Thesis milestone: ${pm.title}`,
      href: "/account",
    })),
    ...crs.map((cr) => ({
      uid: `compute-${cr.id}`,
      date: cr.windowEnd as Date,
      summary: "Compute hours expire — retrieve data and submit results",
      href: "/compute",
    })),
  ];
  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Overdue plus everything inside the window — the "Your week" slice. */
export function dueWithin(items: DeadlineItem[], now: Date, days: number): DeadlineItem[] {
  const cutoff = now.getTime() + days * 24 * 60 * 60 * 1000;
  return items.filter((i) => i.date.getTime() <= cutoff);
}
