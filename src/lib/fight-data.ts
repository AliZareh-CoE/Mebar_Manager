import "server-only";
import { and, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { blockers, milestones, dataRequests, computeRequests, user } from "@/lib/db/schema";
import type { LabSnapshot } from "@/lib/fight-engine";

/**
 * Assemble the fight engine's input from a handful of cheap queries.
 * Pass a visible-project-id set (from visibleProjectIds) to scope the
 * snapshot to what the viewer may see — dependent items of filtered-out
 * projects are dropped by the engine's projectById lookups.
 */
export async function loadLabSnapshot(
  visibleIds: Set<string> | null = null
): Promise<LabSnapshot> {
  const [
    projectRows,
    blockerRows,
    decisionRows,
    milestoneRows,
    dataRequestRows,
    computeRequestRows,
    coordinatorRow,
  ] = await Promise.all([
    db.query.projects.findMany({
      with: {
        owner: { columns: { id: true, name: true } },
        advisor: { columns: { id: true, name: true } },
        updates: {
          columns: { createdAt: true },
          orderBy: (u) => desc(u.createdAt),
          limit: 1,
        },
        // Latest transition INTO ACTIVE — resets the stall clock so a fresh
        // start/revive/unblock isn't counted as pre-existing silence.
        transitions: {
          columns: { createdAt: true },
          where: (t, { eq }) => eq(t.toState, "ACTIVE"),
          orderBy: (t) => desc(t.createdAt),
          limit: 1,
        },
      },
    }),
    db.query.blockers.findMany({
      where: notInArray(blockers.status, ["RESOLVED", "CANCELLED"]),
      with: { owner: { columns: { id: true, name: true } } },
    }),
    db.query.decisions.findMany({
      where: (d, { eq }) => eq(d.status, "PENDING"),
      with: { requestedFrom: { columns: { id: true, name: true } } },
    }),
    db
      .select()
      .from(milestones)
      .where(inArray(milestones.status, ["PLANNED", "IN_PROGRESS"])),
    db.query.dataRequests.findMany({
      where: notInArray(dataRequests.status, ["DELIVERED", "CANCELLED"]),
      with: { assignee: { columns: { id: true, name: true } } },
    }),
    db.query.computeRequests.findMany({
      where: inArray(computeRequests.status, ["PENDING", "APPROVED"]),
      with: { requester: { columns: { id: true, name: true } } },
    }),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(eq(user.isComputeCoordinator, true), ne(user.banned, true)))
      .get(),
  ]);

  const scopedProjects = visibleIds
    ? projectRows.filter((p) => visibleIds.has(p.id))
    : projectRows;

  return {
    projects: scopedProjects.map((p) => ({
      id: p.id,
      title: p.title,
      state: p.state,
      createdAt: p.createdAt,
      lastUpdateAt: p.updates[0]?.createdAt ?? null,
      lastActivatedAt: p.transitions[0]?.createdAt ?? null,
      pauseReason: p.pauseReason,
      reviveDate: p.reviveDate,
      owner: p.owner,
      advisor: p.advisor,
    })),
    openBlockers: blockerRows.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      description: b.description,
      causeTag: b.causeTag,
      ownerId: b.ownerId,
      owner: b.owner,
      deadline: b.deadline,
      status: b.status,
      createdAt: b.createdAt,
    })),
    pendingDecisions: decisionRows.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      question: d.question,
      recommendation: d.recommendation,
      requestedFrom: d.requestedFrom,
      status: d.status,
      createdAt: d.createdAt,
    })),
    openMilestones: milestoneRows.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      title: m.title,
      dueDate: m.dueDate,
      status: m.status,
    })),
    openDataRequests: dataRequestRows.map((dr) => ({
      id: dr.id,
      projectId: dr.projectId,
      title: dr.title,
      neededBy: dr.neededBy,
      createdAt: dr.createdAt,
      status: dr.status,
      assigneeId: dr.assigneeId,
      assignee: dr.assignee,
    })),
    activeComputeRequests: computeRequestRows.map((cr) => ({
      id: cr.id,
      projectId: cr.projectId,
      serverType: cr.serverType,
      hoursNeeded: cr.hoursNeeded,
      status: cr.status,
      createdAt: cr.createdAt,
      requester: cr.requester,
      windowEnd: cr.windowEnd,
    })),
    computeCoordinator: coordinatorRow ?? null,
  };
}

/** Every blocker ever — open and resolved — for the cause Pareto. */
export async function loadAllBlockerCauses(visibleIds: Set<string> | null = null) {
  const rows = await db
    .select({ causeTag: blockers.causeTag, projectId: blockers.projectId })
    .from(blockers)
    // cancelled blockers were never real fights — keep them out of the Pareto
    .where(ne(blockers.status, "CANCELLED"));
  return visibleIds ? rows.filter((r) => visibleIds.has(r.projectId)) : rows;
}
