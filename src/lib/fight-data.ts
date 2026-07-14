import "server-only";
import { desc, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { blockers, milestones } from "@/lib/db/schema";
import type { LabSnapshot } from "@/lib/fight-engine";

/** Assemble the fight engine's input from a handful of cheap queries. */
export async function loadLabSnapshot(): Promise<LabSnapshot> {
  const [projectRows, blockerRows, decisionRows, milestoneRows] = await Promise.all([
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
      where: ne(blockers.status, "RESOLVED"),
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
  ]);

  return {
    projects: projectRows.map((p) => ({
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
  };
}

/** Every blocker ever — open and resolved — for the cause Pareto. */
export function loadAllBlockerCauses() {
  return db.select({ causeTag: blockers.causeTag }).from(blockers);
}
