import {
  differenceInDays,
  differenceInHours,
  format,
  startOfISOWeek,
  startOfMonth,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import type { WorkflowState } from "@/lib/workflow";

/**
 * The stats engine. Pure — no DB, no hidden clock; the loader builds a
 * StatsInput and passes `now` explicitly (performance.ts pattern). Every
 * number is a COUNT or a duration: the pointing system lives elsewhere and
 * nothing here carries weights or points.
 */

/** The fixed recent window shown beside all-time numbers. */
export const STATS_WINDOW_DAYS = 90;

export interface StatsInput {
  users: {
    id: string;
    name: string;
    role: string | null;
    banned: boolean;
  }[];
  projects: { id: string; title: string; state: string; ownerId: string; createdAt: Date }[];
  updates: { authorId: string; createdAt: Date }[];
  milestones: {
    projectId: string;
    status: string;
    dueDate: Date;
    completedAt: Date | null;
  }[];
  blockers: {
    causeTag: string;
    status: string;
    ownerId: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
  }[];
  decisions: { status: string; createdAt: Date; decidedAt: Date | null }[];
  dataRequests: {
    status: string;
    externalRequester: string | null;
    neededBy: Date;
    deliveredAt: Date | null;
  }[];
  computeRequests: { status: string; hoursNeeded: number }[];
  tasks: { status: string }[];
  papers: {
    projectId: string;
    status: string;
    venue: string | null;
    submittedAt: Date | null;
    acceptedAt: Date | null;
  }[];
  projectPeople: {
    projectId: string;
    userId: string | null;
    utfStudentId: string | null;
    role: string;
  }[];
  utfStudents: { id: string; name: string; archived: boolean }[];
  personMilestones: { status: string; dueDate: Date }[];
}

export interface StateSlice {
  key: string;
  label: string;
  color: string;
  count: number;
  running: boolean;
}
export interface MonthPoint {
  month: string;
  count: number;
}
export interface PaperMonthPoint {
  month: string;
  submitted: number;
  accepted: number;
}
export interface WeekPoint {
  week: string;
  updates: number;
  milestonesDone: number;
  blockersResolved: number;
}
export interface VenueRow {
  venue: string;
  drafting: number;
  submitted: number;
  accepted: number;
  closed: number;
}
export interface MemberRow {
  id: string;
  name: string;
  role: string;
  runningOwned: number;
  updatesWindow: number;
  updatesAll: number;
  milestonesDone: number;
  papersSubmitted: number;
  papersAccepted: number;
  blockersResolved: number;
}
export interface UtfRow {
  id: string;
  name: string;
  archived: boolean;
  projectsTagged: number;
  running: number;
  done: number;
  papersSubmitted: number;
  papersAccepted: number;
}

export interface LabStats {
  headline: {
    projectsTotal: number;
    projectsRunning: number;
    papersAccepted: number;
    papersInFlight: number;
    openBlockers: number;
    pendingDecisions: number;
    activeMembers: number;
    utfActive: number;
  };
  projectsByState: StateSlice[];
  projectsCreatedByMonth: MonthPoint[];
  papersPipeline: Record<string, number>;
  papersByMonth: PaperMonthPoint[];
  perVenue: VenueRow[];
  cycle: {
    medianDaysToSubmit: number | null;
    medianDaysToAccept: number | null;
  };
  weeklyThroughput: WeekPoint[];
  bottlenecks: {
    medianBlockerDays: number | null;
    medianDecisionHours: number | null;
    autoProceeded: number;
  };
  requests: {
    data: { open: number; delivered: number; onTimePct: number | null; external: number };
    compute: {
      pending: number;
      approved: number;
      completed: number;
      hoursApproved: number;
    };
    tasksDone: number;
    tasksOpen: number;
  };
  members: MemberRow[];
  utf: UtfRow[];
  students: { planned: number; overdue: number; done: number };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const monthKey = (d: Date) => format(d, "MMM yy");
const weekKey = (d: Date) => format(startOfISOWeek(d), "'W'II MMM d");

export function computeStats(
  input: StatsInput,
  workflowStates: WorkflowState[],
  now: Date
): LabStats {
  const windowStart = subDays(now, STATS_WINDOW_DAYS);
  const inWindow = (d: Date | null) => d !== null && d >= windowStart && d <= now;

  const stateOf = new Map(workflowStates.map((s) => [s.key, s]));
  const isRunning = (state: string) => stateOf.get(state)?.flags.countsForStall ?? false;
  const isTerminal = (state: string) => stateOf.get(state)?.flags.terminal ?? false;

  // Projects by workflow state — workflow order first, then any states the
  // admin has since deleted (raw key fallback keeps history honest).
  const countsByState = new Map<string, number>();
  for (const p of input.projects) {
    countsByState.set(p.state, (countsByState.get(p.state) ?? 0) + 1);
  }
  const projectsByState: StateSlice[] = [
    ...workflowStates
      .filter((s) => !s.archived || (countsByState.get(s.key) ?? 0) > 0)
      .map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        count: countsByState.get(s.key) ?? 0,
        running: s.flags.countsForStall,
      })),
    ...[...countsByState.keys()]
      .filter((k) => !stateOf.has(k))
      .map((k) => ({
        key: k,
        label: k,
        color: "slate",
        count: countsByState.get(k) ?? 0,
        running: false,
      })),
  ];

  // 12-month buckets (oldest first), keyed by formatted label.
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(monthKey(startOfMonth(subMonths(now, i))));
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  const projectsCreatedByMonth: MonthPoint[] = months.map((m) => ({ month: m, count: 0 }));
  for (const p of input.projects) {
    const i = monthIndex.get(monthKey(p.createdAt));
    if (i !== undefined) projectsCreatedByMonth[i].count += 1;
  }

  // Papers.
  const papersPipeline: Record<string, number> = {};
  for (const pp of input.papers) {
    papersPipeline[pp.status] = (papersPipeline[pp.status] ?? 0) + 1;
  }
  const papersByMonth: PaperMonthPoint[] = months.map((m) => ({
    month: m,
    submitted: 0,
    accepted: 0,
  }));
  for (const pp of input.papers) {
    if (pp.submittedAt) {
      const i = monthIndex.get(monthKey(pp.submittedAt));
      if (i !== undefined) papersByMonth[i].submitted += 1;
    }
    if (pp.acceptedAt) {
      const i = monthIndex.get(monthKey(pp.acceptedAt));
      if (i !== undefined) papersByMonth[i].accepted += 1;
    }
  }
  const venueMap = new Map<string, VenueRow>();
  for (const pp of input.papers) {
    const venue = pp.venue?.trim() || "No venue yet";
    const row =
      venueMap.get(venue) ??
      ({ venue, drafting: 0, submitted: 0, accepted: 0, closed: 0 } as VenueRow);
    if (pp.status === "DRAFTING") row.drafting += 1;
    else if (pp.status === "SUBMITTED") row.submitted += 1;
    else if (pp.status === "ACCEPTED") row.accepted += 1;
    else row.closed += 1;
    venueMap.set(venue, row);
  }
  const perVenue = [...venueMap.values()].sort(
    (a, b) => b.accepted - a.accepted || b.submitted - a.submitted
  );

  const projectCreatedAt = new Map(input.projects.map((p) => [p.id, p.createdAt]));
  const daysToSubmit = input.papers
    .filter((pp) => pp.submittedAt && projectCreatedAt.has(pp.projectId))
    .map((pp) => differenceInDays(pp.submittedAt!, projectCreatedAt.get(pp.projectId)!));
  const daysToAccept = input.papers
    .filter((pp) => pp.submittedAt && pp.acceptedAt)
    .map((pp) => differenceInDays(pp.acceptedAt!, pp.submittedAt!));

  // 12 ISO weeks of throughput (oldest first).
  const weeks: string[] = [];
  for (let i = 11; i >= 0; i--) weeks.push(weekKey(subWeeks(now, i)));
  const weekIndex = new Map(weeks.map((w, i) => [w, i]));
  const weeklyThroughput: WeekPoint[] = weeks.map((w) => ({
    week: w,
    updates: 0,
    milestonesDone: 0,
    blockersResolved: 0,
  }));
  for (const u of input.updates) {
    const i = weekIndex.get(weekKey(u.createdAt));
    if (i !== undefined) weeklyThroughput[i].updates += 1;
  }
  for (const m of input.milestones) {
    if (m.status === "DONE" && m.completedAt) {
      const i = weekIndex.get(weekKey(m.completedAt));
      if (i !== undefined) weeklyThroughput[i].milestonesDone += 1;
    }
  }
  for (const b of input.blockers) {
    if (b.status === "RESOLVED" && b.resolvedAt) {
      const i = weekIndex.get(weekKey(b.resolvedAt));
      if (i !== undefined) weeklyThroughput[i].blockersResolved += 1;
    }
  }

  // Bottlenecks.
  const blockerDays = input.blockers
    .filter((b) => b.status === "RESOLVED" && b.resolvedAt)
    .map((b) => differenceInDays(b.resolvedAt!, b.createdAt));
  const decisionHours = input.decisions
    .filter((d) => d.status === "DECIDED" && d.decidedAt)
    .map((d) => differenceInHours(d.decidedAt!, d.createdAt));
  const autoProceeded = input.decisions.filter((d) => d.status === "AUTO_PROCEEDED").length;

  // Requests & tasks.
  const dataOpen = input.dataRequests.filter((r) => r.status === "OPEN").length;
  const dataDelivered = input.dataRequests.filter((r) => r.status === "DELIVERED");
  const dataOnTime = dataDelivered.filter(
    (r) => r.deliveredAt && r.deliveredAt <= r.neededBy
  ).length;
  const compute = {
    pending: input.computeRequests.filter((r) => r.status === "PENDING").length,
    approved: input.computeRequests.filter((r) => r.status === "APPROVED").length,
    completed: input.computeRequests.filter((r) => r.status === "COMPLETED").length,
    hoursApproved: input.computeRequests
      .filter((r) => r.status === "APPROVED" || r.status === "COMPLETED")
      .reduce((sum, r) => sum + r.hoursNeeded, 0),
  };

  // Member contributions — active, non-secretary accounts. Milestones,
  // papers, and blockers attribute to the owning project's owner, matching
  // the house attribution rule.
  const ownerOf = new Map(input.projects.map((p) => [p.id, p.ownerId]));
  const members: MemberRow[] = input.users
    .filter((u) => !u.banned && u.role !== "SECRETARY")
    .map((u) => {
      const owned = input.projects.filter((p) => p.ownerId === u.id);
      const myUpdates = input.updates.filter((up) => up.authorId === u.id);
      return {
        id: u.id,
        name: u.name,
        role: u.role ?? "",
        runningOwned: owned.filter((p) => isRunning(p.state)).length,
        updatesWindow: myUpdates.filter((up) => inWindow(up.createdAt)).length,
        updatesAll: myUpdates.length,
        milestonesDone: input.milestones.filter(
          (m) => m.status === "DONE" && ownerOf.get(m.projectId) === u.id
        ).length,
        papersSubmitted: input.papers.filter(
          (pp) => pp.submittedAt && ownerOf.get(pp.projectId) === u.id
        ).length,
        papersAccepted: input.papers.filter(
          (pp) => pp.status === "ACCEPTED" && ownerOf.get(pp.projectId) === u.id
        ).length,
        blockersResolved: input.blockers.filter(
          (b) => b.status === "RESOLVED" && b.ownerId === u.id
        ).length,
      };
    })
    .sort((a, b) => b.runningOwned - a.runningOwned || a.name.localeCompare(b.name));

  // UTF-student contributions via lineup tags. Archived students stay
  // listed while they're tagged anywhere — history keeps rendering.
  const tagsByStudent = new Map<string, string[]>();
  for (const pp of input.projectPeople) {
    if (!pp.utfStudentId) continue;
    const arr = tagsByStudent.get(pp.utfStudentId) ?? [];
    arr.push(pp.projectId);
    tagsByStudent.set(pp.utfStudentId, arr);
  }
  const utf: UtfRow[] = input.utfStudents
    .filter((s) => !s.archived || tagsByStudent.has(s.id))
    .map((s) => {
      const projectIds = tagsByStudent.get(s.id) ?? [];
      const states = projectIds.map((id) => input.projects.find((p) => p.id === id)?.state);
      const tagged = new Set(projectIds);
      return {
        id: s.id,
        name: s.name,
        archived: s.archived,
        projectsTagged: projectIds.length,
        running: states.filter((st) => st !== undefined && isRunning(st)).length,
        done: states.filter((st) => st !== undefined && isTerminal(st)).length,
        papersSubmitted: input.papers.filter((pp) => pp.submittedAt && tagged.has(pp.projectId))
          .length,
        papersAccepted: input.papers.filter(
          (pp) => pp.status === "ACCEPTED" && tagged.has(pp.projectId)
        ).length,
      };
    })
    .sort((a, b) => b.projectsTagged - a.projectsTagged || a.name.localeCompare(b.name));

  const plannedPersonMilestones = input.personMilestones.filter((m) => m.status === "PLANNED");
  return {
    headline: {
      projectsTotal: input.projects.length,
      projectsRunning: input.projects.filter((p) => isRunning(p.state)).length,
      papersAccepted: papersPipeline["ACCEPTED"] ?? 0,
      papersInFlight: papersPipeline["SUBMITTED"] ?? 0,
      openBlockers: input.blockers.filter(
        (b) => b.status !== "RESOLVED" && b.status !== "CANCELLED"
      ).length,
      pendingDecisions: input.decisions.filter((d) => d.status === "PENDING").length,
      activeMembers: input.users.filter((u) => !u.banned).length,
      utfActive: input.utfStudents.filter((s) => !s.archived).length,
    },
    projectsByState,
    projectsCreatedByMonth,
    papersPipeline,
    papersByMonth,
    perVenue,
    cycle: {
      medianDaysToSubmit: median(daysToSubmit),
      medianDaysToAccept: median(daysToAccept),
    },
    weeklyThroughput,
    bottlenecks: {
      medianBlockerDays: median(blockerDays),
      medianDecisionHours: median(decisionHours),
      autoProceeded,
    },
    requests: {
      data: {
        open: dataOpen,
        delivered: dataDelivered.length,
        onTimePct:
          dataDelivered.length === 0
            ? null
            : Math.round((dataOnTime / dataDelivered.length) * 100),
        external: input.dataRequests.filter((r) => r.externalRequester !== null).length,
      },
      compute,
      tasksDone: input.tasks.filter((t) => t.status === "DONE").length,
      tasksOpen: input.tasks.filter((t) => t.status === "OPEN").length,
    },
    members,
    utf,
    students: {
      planned: plannedPersonMilestones.filter((m) => m.dueDate >= now).length,
      overdue: plannedPersonMilestones.filter((m) => m.dueDate < now).length,
      done: input.personMilestones.filter((m) => m.status === "DONE").length,
    },
  };
}
