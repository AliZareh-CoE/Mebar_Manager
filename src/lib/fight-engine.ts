import { differenceInDays, differenceInMinutes, addHours } from "date-fns";
import type { ProjectState, CauseTag, BlockerStatus, MilestoneStatus } from "@/lib/db/schema";
import {
  STALL_DAYS,
  UNOWNED_BLOCKER_DAYS,
  DECISION_TIMEOUT_HOURS,
  DECISION_URGENT_HOURS,
} from "@/lib/thresholds";

/**
 * The fight engine. Pure — no DB, no hidden clock. Callers build a
 * LabSnapshot from queries and pass `now` explicitly.
 */

export type PersonRef = { id: string; name: string };

export interface ProjectRow {
  id: string;
  title: string;
  state: ProjectState;
  createdAt: Date;
  lastUpdateAt: Date | null;
  /** Latest transition INTO ACTIVE (start/revive/unblock) — resets the stall clock. */
  lastActivatedAt: Date | null;
  pauseReason: string | null;
  reviveDate: Date | null;
  owner: PersonRef;
  advisor: PersonRef;
}

export interface BlockerRow {
  id: string;
  projectId: string;
  description: string;
  causeTag: CauseTag;
  ownerId: string | null;
  owner: PersonRef | null;
  deadline: Date;
  status: BlockerStatus;
  createdAt: Date;
}

export interface DecisionRow {
  id: string;
  projectId: string;
  question: string;
  recommendation: string;
  requestedFrom: PersonRef;
  status: string;
  createdAt: Date;
}

export interface MilestoneRow {
  id: string;
  projectId: string;
  title: string;
  dueDate: Date;
  status: MilestoneStatus;
}

export interface DataRequestRow {
  id: string;
  projectId: string;
  title: string;
  neededBy: Date;
  createdAt: Date;
  status: string;
  assigneeId: string | null;
  assignee: PersonRef | null;
}

export interface LabSnapshot {
  projects: ProjectRow[];
  openBlockers: BlockerRow[];
  pendingDecisions: DecisionRow[];
  openMilestones: MilestoneRow[];
  openDataRequests: DataRequestRow[];
}

export type FightType =
  | "STALLED_PROJECT"
  | "OVERDUE_BLOCKER"
  | "UNOWNED_BLOCKER"
  | "PENDING_DECISION"
  | "PAST_REVIVE"
  | "MISSED_MILESTONE"
  | "OVERDUE_DATA_REQUEST"
  | "UNOWNED_DATA_REQUEST";

/** 3 = red, fight today. 2 = amber, fight this week. 1 = notice. */
export type Severity = 3 | 2 | 1;

export interface FightItem {
  type: FightType;
  severity: Severity;
  /** Days it has been red — drives sorting and the age badge. */
  ageDays: number;
  projectId: string;
  projectTitle: string;
  entityId: string;
  headline: string;
  detail?: string;
  /** Who this item yells at. */
  responsible: PersonRef | null;
}

const TERMINAL_OR_PAUSED: ProjectState[] = ["DONE", "KILLED", "PAUSED"];

/**
 * Days since the project last showed signs of life: an update, or a
 * transition into ACTIVE (start/revive/unblock). Without the activation
 * timestamp, approving a 20-day-old proposal or reviving a sanctioned pause
 * would instantly read as 20 days of "silence".
 */
export function projectAgeDays(
  p: Pick<ProjectRow, "lastUpdateAt" | "lastActivatedAt" | "createdAt">,
  now: Date
): number {
  const lastProgress = Math.max(
    p.createdAt.getTime(),
    p.lastUpdateAt?.getTime() ?? 0,
    p.lastActivatedAt?.getTime() ?? 0
  );
  return Math.max(0, differenceInDays(now, lastProgress));
}

/**
 * Single source of truth for "is this past its date?". Due dates and
 * deadlines are date-only (midnight timestamps), so an item gets its whole
 * due day before turning red — overdue starts the day after. Every surface
 * (fight list, project page, board) must use this, or they contradict each
 * other.
 */
export function isOverdue(date: Date, now: Date): boolean {
  return differenceInDays(now, date) > 0;
}

export function computeFightList(snap: LabSnapshot, now: Date): FightItem[] {
  const items: FightItem[] = [];
  const projectById = new Map(snap.projects.map((p) => [p.id, p]));

  // Stalled projects: ACTIVE/BLOCKED with no sign of life in STALL_DAYS.
  for (const p of snap.projects) {
    if (p.state !== "ACTIVE" && p.state !== "BLOCKED") continue;
    const age = projectAgeDays(p, now);
    if (age > STALL_DAYS) {
      items.push({
        type: "STALLED_PROJECT",
        severity: 3,
        ageDays: age - STALL_DAYS,
        projectId: p.id,
        projectTitle: p.title,
        entityId: p.id,
        headline: `No update in ${age} days`,
        detail: "Silence is how projects die. One update resets the clock.",
        responsible: p.owner,
      });
    }
  }

  // Paused projects past their revive date.
  for (const p of snap.projects) {
    if (p.state !== "PAUSED" || !p.reviveDate) continue;
    const over = differenceInDays(now, p.reviveDate);
    if (over > 0) {
      items.push({
        type: "PAST_REVIVE",
        severity: 3,
        ageDays: over,
        projectId: p.id,
        projectTitle: p.title,
        entityId: p.id,
        headline: `Revive date passed ${over}d ago — revive it or kill it`,
        detail: p.pauseReason ?? undefined,
        responsible: p.advisor,
      });
    }
  }

  for (const b of snap.openBlockers) {
    if (b.status === "RESOLVED") continue;
    const project = projectById.get(b.projectId);
    if (!project || TERMINAL_OR_PAUSED.includes(project.state)) continue;

    // Overdue blockers.
    const overdueDays = differenceInDays(now, b.deadline);
    if (overdueDays > 0) {
      items.push({
        type: "OVERDUE_BLOCKER",
        severity: 3,
        ageDays: overdueDays,
        projectId: b.projectId,
        projectTitle: project.title,
        entityId: b.id,
        headline: `Blocker ${overdueDays}d past its deadline`,
        detail: b.description,
        responsible: b.owner ?? project.advisor,
      });
      continue; // overdue beats unowned — one fight per blocker
    }

    // Unowned blockers past the grace period. An ESCALATED blocker is MORE
    // urgent, not less — escalating must never hide it from the list.
    if (!b.ownerId) {
      const unownedDays = differenceInDays(now, b.createdAt);
      if (unownedDays > UNOWNED_BLOCKER_DAYS || b.status === "ESCALATED") {
        items.push({
          type: "UNOWNED_BLOCKER",
          severity: b.status === "ESCALATED" ? 3 : 2,
          ageDays: Math.max(0, unownedDays - UNOWNED_BLOCKER_DAYS),
          projectId: b.projectId,
          projectTitle: project.title,
          entityId: b.id,
          headline:
            b.status === "ESCALATED"
              ? `Escalated blocker still has no owner (${unownedDays}d old)`
              : `Nobody owns this blocker (${unownedDays}d old)`,
          detail: b.description,
          responsible: project.advisor,
        });
      }
    }
  }

  // Data requests obey the same rules as blockers: overdue ones yell at the
  // analyst (or the advisor if unowned), unowned ones escalate after the
  // grace period. "All rules apply to them."
  for (const dr of snap.openDataRequests) {
    if (dr.status === "DELIVERED") continue;
    const project = projectById.get(dr.projectId);
    if (!project || TERMINAL_OR_PAUSED.includes(project.state)) continue;

    const overdueDays = differenceInDays(now, dr.neededBy);
    if (overdueDays > 0) {
      items.push({
        type: "OVERDUE_DATA_REQUEST",
        severity: 3,
        ageDays: overdueDays,
        projectId: dr.projectId,
        projectTitle: project.title,
        entityId: dr.id,
        headline: `Data request ${overdueDays}d past its needed-by date`,
        detail: dr.title,
        responsible: dr.assignee ?? project.advisor,
      });
      continue; // overdue beats unowned — one fight per request
    }

    if (!dr.assigneeId) {
      const unownedDays = differenceInDays(now, dr.createdAt);
      if (unownedDays > UNOWNED_BLOCKER_DAYS) {
        items.push({
          type: "UNOWNED_DATA_REQUEST",
          severity: 2,
          ageDays: unownedDays - UNOWNED_BLOCKER_DAYS,
          projectId: dr.projectId,
          projectTitle: project.title,
          entityId: dr.id,
          headline: `No analyst owns this data request (${unownedDays}d old)`,
          detail: dr.title,
          responsible: project.advisor,
        });
      }
    }
  }

  // Pending decisions — every one on a *moving* project is on the list;
  // urgency grows as the 48h auto-proceed deadline approaches. Decisions on
  // paused/finished projects neither fight nor auto-proceed (see
  // expireOverdueDecisions), so a pause freezes its open questions too.
  for (const d of snap.pendingDecisions) {
    if (d.status !== "PENDING") continue;
    const project = projectById.get(d.projectId);
    if (!project || TERMINAL_OR_PAUSED.includes(project.state)) continue;
    const deadline = addHours(d.createdAt, DECISION_TIMEOUT_HOURS);
    const minutesLeft = differenceInMinutes(deadline, now);
    const hoursLeft = Math.floor(minutesLeft / 60);
    items.push({
      type: "PENDING_DECISION",
      severity: hoursLeft < DECISION_URGENT_HOURS ? 3 : 2,
      ageDays: Math.max(0, differenceInDays(now, d.createdAt)),
      projectId: d.projectId,
      projectTitle: project.title,
      entityId: d.id,
      headline:
        minutesLeft <= 0
          ? "Decision needed — auto-proceeding"
          : hoursLeft < 1
            ? "Decision needed — auto-proceeds in under an hour"
            : `Decision needed — auto-proceeds in ${hoursLeft}h`,
      detail: `${d.question} (recommendation: ${d.recommendation})`,
      responsible: d.requestedFrom,
    });
  }

  // Missed milestones on projects that are still supposed to be moving.
  for (const m of snap.openMilestones) {
    if (m.status === "DONE") continue;
    const project = projectById.get(m.projectId);
    if (!project || TERMINAL_OR_PAUSED.includes(project.state)) continue;
    const over = differenceInDays(now, m.dueDate);
    if (over > 0) {
      items.push({
        type: "MISSED_MILESTONE",
        severity: 2,
        ageDays: over,
        projectId: m.projectId,
        projectTitle: project.title,
        entityId: m.id,
        headline: `Milestone "${m.title}" is ${over}d past due`,
        detail: "Close it, or push the date with a reason.",
        responsible: project.owner,
      });
    }
  }

  return items.sort((a, b) => b.severity - a.severity || b.ageDays - a.ageDays);
}

export interface ParetoSlice {
  causeTag: CauseTag;
  count: number;
  pct: number;
}

/** What keeps blocking the lab — open + resolved, for the monthly review. */
export function computeParetoData(
  blockers: Pick<BlockerRow, "causeTag">[]
): ParetoSlice[] {
  const counts = new Map<CauseTag, number>();
  for (const b of blockers) {
    counts.set(b.causeTag, (counts.get(b.causeTag) ?? 0) + 1);
  }
  const total = blockers.length;
  return [...counts.entries()]
    .map(([causeTag, count]) => ({
      causeTag,
      count,
      pct: total === 0 ? 0 : Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}
