import "server-only";
import { db } from "@/lib/db";
import {
  blockers,
  computeRequests,
  dataRequests,
  decisions,
  milestones,
  papers,
  personMilestones,
  projectPeople,
  projects,
  tasks,
  updates,
  utfStudents,
} from "@/lib/db/schema";
import { user } from "@/lib/db/auth-schema";
import type { StatsInput } from "@/lib/stats";

/**
 * One all-time load feeding the stats engine. Narrow column lists; the
 * windowing happens in the pure compute so a single load serves both the
 * 90-day and all-time views. Lab-scale row counts make this cheap.
 */
export async function loadStatsInput(): Promise<StatsInput> {
  const [
    userRows,
    projectRows,
    updateRows,
    milestoneRows,
    blockerRows,
    decisionRows,
    dataRequestRows,
    computeRows,
    taskRows,
    paperRows,
    peopleRows,
    utfRows,
    personMilestoneRows,
  ] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, role: user.role, banned: user.banned })
      .from(user),
    db
      .select({
        id: projects.id,
        state: projects.state,
        ownerId: projects.ownerId,
        createdAt: projects.createdAt,
      })
      .from(projects),
    db.select({ authorId: updates.authorId, createdAt: updates.createdAt }).from(updates),
    db
      .select({
        projectId: milestones.projectId,
        status: milestones.status,
        dueDate: milestones.dueDate,
        completedAt: milestones.completedAt,
      })
      .from(milestones),
    db
      .select({
        causeTag: blockers.causeTag,
        status: blockers.status,
        ownerId: blockers.ownerId,
        createdAt: blockers.createdAt,
        resolvedAt: blockers.resolvedAt,
      })
      .from(blockers),
    db
      .select({
        status: decisions.status,
        createdAt: decisions.createdAt,
        decidedAt: decisions.decidedAt,
      })
      .from(decisions),
    db
      .select({
        status: dataRequests.status,
        externalRequester: dataRequests.externalRequester,
        neededBy: dataRequests.neededBy,
        deliveredAt: dataRequests.deliveredAt,
      })
      .from(dataRequests),
    db
      .select({ status: computeRequests.status, hoursNeeded: computeRequests.hoursNeeded })
      .from(computeRequests),
    db.select({ status: tasks.status }).from(tasks),
    db
      .select({
        projectId: papers.projectId,
        status: papers.status,
        venue: papers.venue,
        submittedAt: papers.submittedAt,
        acceptedAt: papers.acceptedAt,
      })
      .from(papers),
    db
      .select({
        projectId: projectPeople.projectId,
        userId: projectPeople.userId,
        utfStudentId: projectPeople.utfStudentId,
        role: projectPeople.role,
      })
      .from(projectPeople),
    db
      .select({ id: utfStudents.id, name: utfStudents.name, archived: utfStudents.archived })
      .from(utfStudents),
    db
      .select({ status: personMilestones.status, dueDate: personMilestones.dueDate })
      .from(personMilestones),
  ]);

  return {
    users: userRows.map((u) => ({ ...u, banned: u.banned ?? false })),
    projects: projectRows,
    updates: updateRows,
    milestones: milestoneRows,
    blockers: blockerRows,
    decisions: decisionRows,
    dataRequests: dataRequestRows,
    computeRequests: computeRows,
    tasks: taskRows,
    papers: paperRows,
    projectPeople: peopleRows,
    utfStudents: utfRows,
    personMilestones: personMilestoneRows,
  };
}
