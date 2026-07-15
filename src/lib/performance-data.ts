import "server-only";
import { and, eq, gte, ne, notInArray } from "drizzle-orm";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import {
  blockers,
  computeRequests,
  dataRequests,
  decisions,
  initiatives,
  milestones,
  papers,
  projects,
  tasks,
  updates,
  user,
} from "@/lib/db/schema";
import type { LabSettings } from "@/lib/settings";
import { computeFightList, type FightType } from "@/lib/fight-engine";
import { loadLabSnapshot } from "@/lib/fight-data";
import { activationStateKeys, engineStateFlags } from "@/lib/workflow";
import type { PerformanceInput } from "@/lib/performance";

/**
 * The overdue penalty counts exactly what the Fight List yells about —
 * derived from the engine, so the two can never disagree, and rules an
 * admin disabled stop penalizing.
 */
const PENALIZED_FIGHT_TYPES: FightType[] = [
  "STALLED_PROJECT",
  "OVERDUE_BLOCKER",
  "OVERDUE_TASK",
  "OVERDUE_DATA_REQUEST",
  "OVERDUE_COMPUTE_RESULTS",
  "OVERDUE_INITIATIVE",
];

export async function loadPerformanceInput(
  settings: LabSettings,
  now: Date = new Date()
): Promise<PerformanceInput> {
  const windowStart = subDays(now, settings.performance.windowDays);
  const workflow = settings.workflow;

  const [
    people,
    milestonesDone,
    blockersResolved,
    blockersCreated,
    tasksDone,
    tasksCreated,
    dataDelivered,
    dataCreated,
    decisionsDecided,
    decisionsAuto,
    computeDecidedRows,
    computeCompleted,
    initiativesWonRows,
    initiativesCreated,
    papersSubmittedRows,
    papersAcceptedRows,
    projectsCreated,
    updateRows,
    snapshot,
  ] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        role: user.role,
        isDataAnalyst: user.isDataAnalyst,
        isComputeCoordinator: user.isComputeCoordinator,
      })
      .from(user)
      .where(ne(user.banned, true)),
    db.query.milestones.findMany({
      where: and(eq(milestones.status, "DONE"), gte(milestones.completedAt, windowStart)),
      columns: { completedAt: true, dueDate: true },
      with: { project: { columns: { ownerId: true } } },
    }),
    db
      .select({ ownerId: blockers.ownerId, resolvedAt: blockers.resolvedAt })
      .from(blockers)
      .where(and(eq(blockers.status, "RESOLVED"), gte(blockers.resolvedAt, windowStart))),
    db
      .select({ raisedById: blockers.raisedById, createdAt: blockers.createdAt })
      .from(blockers)
      .where(and(ne(blockers.status, "CANCELLED"), gte(blockers.createdAt, windowStart))),
    db
      .select({ assigneeId: tasks.assigneeId, completedAt: tasks.completedAt, deadline: tasks.deadline })
      .from(tasks)
      .where(and(eq(tasks.status, "DONE"), gte(tasks.completedAt, windowStart))),
    db
      .select({ requesterId: tasks.requesterId, createdAt: tasks.createdAt })
      .from(tasks)
      .where(and(ne(tasks.status, "CANCELLED"), gte(tasks.createdAt, windowStart))),
    db
      .select({
        assigneeId: dataRequests.assigneeId,
        deliveredAt: dataRequests.deliveredAt,
        neededBy: dataRequests.neededBy,
      })
      .from(dataRequests)
      .where(and(eq(dataRequests.status, "DELIVERED"), gte(dataRequests.deliveredAt, windowStart))),
    db
      .select({ requesterId: dataRequests.requesterId, createdAt: dataRequests.createdAt })
      .from(dataRequests)
      .where(and(ne(dataRequests.status, "CANCELLED"), gte(dataRequests.createdAt, windowStart))),
    db
      .select({
        decidedById: decisions.decidedById,
        decidedAt: decisions.decidedAt,
        createdAt: decisions.createdAt,
      })
      .from(decisions)
      .where(and(eq(decisions.status, "DECIDED"), gte(decisions.decidedAt, windowStart))),
    db
      .select({ requestedFromId: decisions.requestedFromId, decidedAt: decisions.decidedAt })
      .from(decisions)
      .where(and(eq(decisions.status, "AUTO_PROCEEDED"), gte(decisions.decidedAt, windowStart))),
    db
      .select({ decidedById: computeRequests.decidedById, decidedAt: computeRequests.decidedAt })
      .from(computeRequests)
      .where(
        and(
          notInArray(computeRequests.status, ["PENDING", "WITHDRAWN"]),
          gte(computeRequests.decidedAt, windowStart)
        )
      ),
    db
      .select({ requesterId: computeRequests.requesterId, completedAt: computeRequests.completedAt })
      .from(computeRequests)
      .where(and(eq(computeRequests.status, "COMPLETED"), gte(computeRequests.completedAt, windowStart))),
    db
      .select({ assigneeId: initiatives.assigneeId, closedAt: initiatives.closedAt })
      .from(initiatives)
      .where(and(eq(initiatives.status, "WON"), gte(initiatives.closedAt, windowStart))),
    db
      .select({ requesterId: initiatives.requesterId, createdAt: initiatives.createdAt })
      .from(initiatives)
      .where(and(ne(initiatives.status, "CANCELLED"), gte(initiatives.createdAt, windowStart))),
    // Paper credit goes to the project owner (locked decision). WITHDRAWN
    // papers earn no submit credit — file-and-withdraw farms nothing.
    db.query.papers.findMany({
      where: and(ne(papers.status, "WITHDRAWN"), gte(papers.submittedAt, windowStart)),
      columns: { submittedAt: true },
      with: { project: { columns: { ownerId: true } } },
    }),
    db.query.papers.findMany({
      where: and(eq(papers.status, "ACCEPTED"), gte(papers.acceptedAt, windowStart)),
      columns: { acceptedAt: true },
      with: { project: { columns: { ownerId: true } } },
    }),
    db
      .select({ createdById: projects.createdById, createdAt: projects.createdAt })
      .from(projects)
      .where(gte(projects.createdAt, windowStart)),
    db
      .select({ authorId: updates.authorId, projectId: updates.projectId, createdAt: updates.createdAt })
      .from(updates)
      .where(gte(updates.createdAt, windowStart)),
    // Unscoped snapshot (null visibility) — penalties are lab-wide truth.
    loadLabSnapshot(
      null,
      activationStateKeys(workflow),
      Object.fromEntries(settings.serverTypes.map((s) => [s.key, s.label])),
      null,
      true
    ),
  ]);

  const fights = computeFightList(snapshot, now, settings.thresholds, {
    stateFlags: engineStateFlags(workflow),
    enabledRules: Object.fromEntries(
      Object.entries(settings.fightRules).map(([type, rule]) => [type, rule.enabled])
    ),
  });
  const overdueOwned = fights
    .filter((f) => PENALIZED_FIGHT_TYPES.includes(f.type) && f.responsible)
    .map((f) => ({ responsibleId: f.responsible!.id }));

  return {
    people: people.map((p) => ({ ...p, role: p.role ?? "ENGINEER" })),
    milestonesDone: milestonesDone.map((m) => ({
      ownerId: m.project?.ownerId ?? null,
      completedAt: m.completedAt!,
      dueDate: m.dueDate,
    })),
    blockersResolved: blockersResolved
      .filter((b) => b.resolvedAt !== null)
      .map((b) => ({ ownerId: b.ownerId, resolvedAt: b.resolvedAt! })),
    tasksDone: tasksDone
      .filter((t) => t.completedAt !== null)
      .map((t) => ({ assigneeId: t.assigneeId, completedAt: t.completedAt!, deadline: t.deadline })),
    dataRequestsDelivered: dataDelivered
      .filter((d) => d.deliveredAt !== null)
      .map((d) => ({ assigneeId: d.assigneeId, deliveredAt: d.deliveredAt!, neededBy: d.neededBy })),
    decisionsDecided: decisionsDecided
      .filter((d) => d.decidedAt !== null)
      .map((d) => ({ decidedById: d.decidedById, decidedAt: d.decidedAt!, createdAt: d.createdAt })),
    computeDecided: computeDecidedRows
      .filter((c) => c.decidedAt !== null)
      .map((c) => ({ decidedById: c.decidedById, decidedAt: c.decidedAt! })),
    computeResultsSubmitted: computeCompleted
      .filter((c) => c.completedAt !== null)
      .map((c) => ({ requesterId: c.requesterId, completedAt: c.completedAt! })),
    initiativesWon: initiativesWonRows
      .filter((i) => i.closedAt !== null)
      .map((i) => ({ assigneeId: i.assigneeId, closedAt: i.closedAt! })),
    papersSubmitted: papersSubmittedRows
      .filter((pp) => pp.submittedAt !== null)
      .map((pp) => ({ ownerId: pp.project?.ownerId ?? null, submittedAt: pp.submittedAt! })),
    papersAccepted: papersAcceptedRows
      .filter((pp) => pp.acceptedAt !== null)
      .map((pp) => ({ ownerId: pp.project?.ownerId ?? null, acceptedAt: pp.acceptedAt! })),
    updates: updateRows,
    overdueOwned,
    decisionsAutoProceeded: decisionsAuto
      .filter((d) => d.decidedAt !== null)
      .map((d) => ({ requestedFromId: d.requestedFromId, decidedAt: d.decidedAt! })),
    proposalsFiled: projectsCreated,
    blockersRaised: blockersCreated,
    tasksFiled: tasksCreated,
    dataRequestsFiled: dataCreated,
    initiativesFiled: initiativesCreated,
  };
}
