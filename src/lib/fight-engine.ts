import { differenceInDays, differenceInHours, differenceInMinutes, addHours } from "date-fns";
import type { BlockerStatus, MilestoneStatus } from "@/lib/db/schema";
import { engineStateFlags } from "@/lib/workflow";
import { DEFAULT_WORKFLOW } from "@/lib/settings-defaults";
import {
  STALL_DAYS,
  UNOWNED_BLOCKER_DAYS,
  DECISION_TIMEOUT_HOURS,
  DECISION_URGENT_HOURS,
  COMPUTE_PENDING_URGENT_HOURS,
  COMPUTE_RESULTS_URGENT_DAYS,
} from "@/lib/thresholds";

/**
 * The fight engine. Pure — no DB, no hidden clock. Callers build a
 * LabSnapshot from queries and pass `now` explicitly.
 */

export type PersonRef = { id: string; name: string };

export interface ProjectRow {
  id: string;
  title: string;
  /** A workflow state key — semantics come from FightConfig.stateFlags. */
  state: string;
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
  /** Admin-defined cause-tag key. */
  causeTag: string;
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

export interface ComputeRequestRow {
  id: string;
  projectId: string;
  serverType: string;
  /** Resolved from settings by the snapshot loader; falls back to the key. */
  serverTypeLabel?: string;
  hoursNeeded: number;
  status: string;
  createdAt: Date;
  requester: PersonRef;
  windowEnd: Date | null;
}

export interface LabSnapshot {
  projects: ProjectRow[];
  openBlockers: BlockerRow[];
  pendingDecisions: DecisionRow[];
  openMilestones: MilestoneRow[];
  openDataRequests: DataRequestRow[];
  /** PENDING + APPROVED compute requests. */
  activeComputeRequests: ComputeRequestRow[];
  /** The one flagged manager, if any. */
  computeCoordinator: PersonRef | null;
}

export type FightType =
  | "STALLED_PROJECT"
  | "OVERDUE_BLOCKER"
  | "UNOWNED_BLOCKER"
  | "PENDING_DECISION"
  | "PAST_REVIVE"
  | "MISSED_MILESTONE"
  | "OVERDUE_DATA_REQUEST"
  | "UNOWNED_DATA_REQUEST"
  | "PENDING_COMPUTE_REQUEST"
  | "OVERDUE_COMPUTE_RESULTS";

/** 3 = red, fight today. 2 = amber, fight this week. 1 = notice. */
export type Severity = 3 | 2 | 1;

/** Tunable rule numbers — admin-editable; constants remain the defaults. */
export interface FightThresholds {
  stallDays: number;
  unownedGraceDays: number;
  decisionTimeoutHours: number;
  decisionUrgentHours: number;
  computePendingUrgentHours: number;
  computeResultsUrgentDays: number;
}

export const DEFAULT_THRESHOLDS: FightThresholds = {
  stallDays: STALL_DAYS,
  unownedGraceDays: UNOWNED_BLOCKER_DAYS,
  decisionTimeoutHours: DECISION_TIMEOUT_HOURS,
  decisionUrgentHours: DECISION_URGENT_HOURS,
  computePendingUrgentHours: COMPUTE_PENDING_URGENT_HOURS,
  computeResultsUrgentDays: COMPUTE_RESULTS_URGENT_DAYS,
};

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

/** Per-state semantics — what the rules ask instead of comparing key literals. */
export interface StateSemantics {
  /** Terminal or paused: nothing on the project fights (except results debts). */
  frozen: boolean;
  /** The stall rule watches this state. */
  countsForStall: boolean;
  /** The past-revive rule watches this state. */
  paused: boolean;
}

export interface FightConfig {
  /** Keyed by workflow state key; unknown states are treated as moving. */
  stateFlags?: Record<string, StateSemantics>;
  /** Per-rule off switch — admin-configurable; missing means enabled. */
  enabledRules?: Partial<Record<FightType, boolean>>;
}

const DEFAULT_STATE_FLAGS = engineStateFlags(DEFAULT_WORKFLOW);
const MOVING: StateSemantics = { frozen: false, countsForStall: false, paused: false };

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

export function computeFightList(
  snap: LabSnapshot,
  now: Date,
  t: FightThresholds = DEFAULT_THRESHOLDS,
  config: FightConfig = {}
): FightItem[] {
  const items: FightItem[] = [];
  const projectById = new Map(snap.projects.map((p) => [p.id, p]));
  const stateFlags = config.stateFlags ?? DEFAULT_STATE_FLAGS;
  const flagsOf = (state: string): StateSemantics => stateFlags[state] ?? MOVING;
  const enabled = (type: FightType) => config.enabledRules?.[type] !== false;

  // Stalled projects: stall-counted states with no sign of life in t.stallDays.
  for (const p of snap.projects) {
    if (!enabled("STALLED_PROJECT")) break;
    if (!flagsOf(p.state).countsForStall) continue;
    const age = projectAgeDays(p, now);
    if (age > t.stallDays) {
      items.push({
        type: "STALLED_PROJECT",
        severity: 3,
        ageDays: age - t.stallDays,
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
    if (!enabled("PAST_REVIVE")) break;
    if (!flagsOf(p.state).paused || !p.reviveDate) continue;
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
    if (b.status === "RESOLVED" || b.status === "CANCELLED") continue;
    const project = projectById.get(b.projectId);
    if (!project || flagsOf(project.state).frozen) continue;

    // Overdue blockers.
    const overdueDays = differenceInDays(now, b.deadline);
    if (overdueDays > 0 && enabled("OVERDUE_BLOCKER")) {
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
    if (!b.ownerId && enabled("UNOWNED_BLOCKER")) {
      const unownedDays = differenceInDays(now, b.createdAt);
      if (unownedDays > t.unownedGraceDays || b.status === "ESCALATED") {
        items.push({
          type: "UNOWNED_BLOCKER",
          severity: b.status === "ESCALATED" ? 3 : 2,
          ageDays: Math.max(0, unownedDays - t.unownedGraceDays),
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
    if (dr.status === "DELIVERED" || dr.status === "CANCELLED") continue;
    const project = projectById.get(dr.projectId);
    if (!project || flagsOf(project.state).frozen) continue;

    const overdueDays = differenceInDays(now, dr.neededBy);
    if (overdueDays > 0 && enabled("OVERDUE_DATA_REQUEST")) {
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

    if (!dr.assigneeId && enabled("UNOWNED_DATA_REQUEST")) {
      const unownedDays = differenceInDays(now, dr.createdAt);
      if (unownedDays > t.unownedGraceDays) {
        items.push({
          type: "UNOWNED_DATA_REQUEST",
          severity: 2,
          ageDays: unownedDays - t.unownedGraceDays,
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
    if (!enabled("PENDING_DECISION")) break;
    if (d.status !== "PENDING") continue;
    const project = projectById.get(d.projectId);
    if (!project || flagsOf(project.state).frozen) continue;
    const deadline = addHours(d.createdAt, t.decisionTimeoutHours);
    const minutesLeft = differenceInMinutes(deadline, now);
    const hoursLeft = Math.floor(minutesLeft / 60);
    items.push({
      type: "PENDING_DECISION",
      severity: hoursLeft < t.decisionUrgentHours ? 3 : 2,
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
    if (!enabled("MISSED_MILESTONE")) break;
    if (m.status === "DONE" || m.status === "CANCELLED") continue;
    const project = projectById.get(m.projectId);
    if (!project || flagsOf(project.state).frozen) continue;
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

  // Compute requests. Two debts: the coordinator owes a decision on every
  // pending request (they NEVER auto-proceed — nobody hands out GPU access
  // by timeout), and the requester owes a results summary once the usage
  // window closes.
  for (const cr of snap.activeComputeRequests) {
    const project = projectById.get(cr.projectId);
    if (!project) continue;

    if (cr.status === "PENDING" && enabled("PENDING_COMPUTE_REQUEST")) {
      // A pause freezes the project's requests, same as decisions.
      if (flagsOf(project.state).frozen) continue;
      const hoursOld = differenceInHours(now, cr.createdAt);
      items.push({
        type: "PENDING_COMPUTE_REQUEST",
        severity: hoursOld > t.computePendingUrgentHours ? 3 : 2,
        ageDays: Math.max(0, differenceInDays(now, cr.createdAt)),
        projectId: cr.projectId,
        projectTitle: project.title,
        entityId: cr.id,
        headline: `Compute request (${cr.serverTypeLabel ?? cr.serverType.replace("_", "-")}, ${cr.hoursNeeded}h) waiting ${hoursOld}h for a decision`,
        detail: "Compute requests never auto-proceed. Approve it or deny it with a reason.",
        responsible: snap.computeCoordinator,
      });
    }

    if (cr.status === "APPROVED" && cr.windowEnd && enabled("OVERDUE_COMPUTE_RESULTS")) {
      // Deliberately NOT gated on frozen states: the hours were burned,
      // so the results debt survives a pause or even a kill. This is the one
      // rule that deviates — don't "fix" it.
      const over = differenceInDays(now, cr.windowEnd);
      if (over > 0) {
        items.push({
          type: "OVERDUE_COMPUTE_RESULTS",
          severity: over > t.computeResultsUrgentDays ? 3 : 2,
          ageDays: over,
          projectId: cr.projectId,
          projectTitle: project.title,
          entityId: cr.id,
          headline: `Compute window ended ${over}d ago — results summary owed`,
          detail:
            "Final outcomes vs. expected. And retrieve all data and checkpoints — the server doesn't keep them.",
          responsible: cr.requester,
        });
      }
    }
  }

  return items.sort((a, b) => b.severity - a.severity || b.ageDays - a.ageDays);
}

export interface ParetoSlice {
  causeTag: string;
  count: number;
  pct: number;
}

/** What keeps blocking the lab — open + resolved, for the monthly review. */
export function computeParetoData(
  blockers: Pick<BlockerRow, "causeTag">[]
): ParetoSlice[] {
  const counts = new Map<string, number>();
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
