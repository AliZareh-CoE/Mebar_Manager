import "server-only";
import { and, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  blockers,
  milestones,
  dataRequests,
  computeRequests,
  tasks,
  initiatives,
  projectPeople,
  papers,
  user,
} from "@/lib/db/schema";
import type { LabSnapshot } from "@/lib/fight-engine";
import { activationStateKeys } from "@/lib/workflow";
import { DEFAULT_WORKFLOW } from "@/lib/settings-defaults";

/**
 * Assemble the fight engine's input from a handful of cheap queries.
 * Pass a visible-project-id set (from visibleProjectIds) to scope the
 * snapshot to what the viewer may see — dependent items of filtered-out
 * projects are dropped by the engine's projectById lookups.
 */
export async function loadLabSnapshot(
  visibleIds: Set<string> | null = null,
  /** States whose entry resets the stall clock (workflow resetsStallClock). */
  activationStates: readonly string[] = activationStateKeys(DEFAULT_WORKFLOW),
  /** Server-type labels from settings, for fight headlines. */
  serverTypeLabels: Record<string, string> = {},
  /** From visibleTaskIds — null means all tasks. */
  taskIds: Set<string> | null = null,
  /**
   * Leadership (managers + the compute coordinator) sees all initiatives;
   * everyone else none. Default false — fails closed for existing callers.
   */
  includeInitiatives = false,
  /**
   * Whose project-load to evaluate for UNDERLOADED_RESEARCHER: leadership
   * sees every researcher, an engineer only themselves, secretaries (and
   * the performance loader) none. Fails closed.
   */
  underloadScope: "ALL" | { selfId: string } | "NONE" = "NONE"
): Promise<LabSnapshot> {
  // inArray needs a non-empty list; a workflow with no activation states
  // simply never resets the clock via transitions.
  const activationKeys = activationStates.length ? [...activationStates] : ["__NONE__"];
  const [
    projectRows,
    blockerRows,
    decisionRows,
    milestoneRows,
    dataRequestRows,
    computeRequestRows,
    taskRows,
    initiativeRows,
    projectPeopleRows,
    paperRows,
    researcherRows,
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
        // Latest transition INTO an activation state — resets the stall
        // clock so a fresh start/revive/unblock isn't counted as
        // pre-existing silence.
        transitions: {
          columns: { createdAt: true },
          where: (t, { inArray }) => inArray(t.toState, activationKeys),
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
    db.query.tasks.findMany({
      where: eq(tasks.status, "OPEN"),
      with: {
        assignee: { columns: { id: true, name: true } },
        requester: { columns: { id: true, name: true } },
      },
    }),
    includeInitiatives
      ? db.query.initiatives.findMany({
          where: eq(initiatives.status, "OPEN"),
          with: {
            assignee: { columns: { id: true, name: true } },
            requester: { columns: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
    // PI/FIRST_AUTHOR rows only — the missing-people rule needs existence,
    // not the whole lineup. Scoped to visible projects by the engine.
    db
      .select({ projectId: projectPeople.projectId, role: projectPeople.role })
      .from(projectPeople)
      .where(inArray(projectPeople.role, ["PI", "FIRST_AUTHOR"])),
    // Any paper row (any status) suppresses the paperless rule.
    db.select({ projectId: papers.projectId }).from(papers),
    underloadScope === "NONE"
      ? Promise.resolve([])
      : db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(
            underloadScope === "ALL"
              ? and(eq(user.role, "ENGINEER"), ne(user.banned, true))
              : and(
                  eq(user.id, underloadScope.selfId),
                  eq(user.role, "ENGINEER"),
                  ne(user.banned, true)
                )
          ),
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
      serverTypeLabel: serverTypeLabels[cr.serverType],
      hoursNeeded: cr.hoursNeeded,
      status: cr.status,
      createdAt: cr.createdAt,
      requester: cr.requester,
      windowEnd: cr.windowEnd,
    })),
    openInitiatives: initiativeRows.map((i) => ({
      id: i.id,
      title: i.title,
      deadline: i.deadline,
      createdAt: i.createdAt,
      status: i.status,
      assigneeId: i.assigneeId,
      assignee: i.assignee,
      requester: i.requester,
    })),
    openTasks: taskRows
      .filter((t) => taskIds === null || taskIds.has(t.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        deadline: t.deadline,
        createdAt: t.createdAt,
        status: t.status,
        assigneeId: t.assigneeId,
        assignee: t.assignee,
        requester: t.requester,
        projectId: t.projectId,
      })),
    projectPeople: projectPeopleRows.map((pp) => ({
      projectId: pp.projectId,
      role: pp.role as "PI" | "FIRST_AUTHOR",
    })),
    papers: paperRows,
    researchers: researcherRows,
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
