import { addHours, differenceInDays, startOfISOWeek, subDays } from "date-fns";
import {
  METRIC_CATEGORY,
  PERFORMANCE_CATEGORIES,
  PERFORMANCE_METRICS,
  type PerformanceCategory,
  type PerformanceMetric,
} from "@/lib/performance-metrics";

/**
 * The performance engine. Pure — no DB, no hidden clock; the loader
 * (performance-data.ts) builds the input and the caller passes `now`.
 *
 * score = Σ weights[metric] × counted[metric]. Everything is a count of
 * events in the rolling window, except `overdueOwnedItem`, which is a
 * point-in-time count derived FROM the fight engine so the penalty can
 * never disagree with the Fight List.
 */

export type PersonEntry = {
  id: string;
  name: string;
  role: string;
  isDataAnalyst: boolean;
  isComputeCoordinator: boolean;
};

export interface PerformanceInput {
  /** Everyone unbanned — "we spare no one": zero-activity people appear. */
  people: PersonEntry[];
  // Delivery events (credit timestamp decides the window).
  milestonesDone: { ownerId: string | null; completedAt: Date; dueDate: Date }[];
  blockersResolved: { ownerId: string | null; resolvedAt: Date }[];
  tasksDone: { assigneeId: string | null; completedAt: Date; deadline: Date }[];
  dataRequestsDelivered: { assigneeId: string | null; deliveredAt: Date; neededBy: Date }[];
  decisionsDecided: { decidedById: string | null; decidedAt: Date; createdAt: Date }[];
  computeDecided: { decidedById: string | null; decidedAt: Date }[];
  computeResultsSubmitted: { requesterId: string; completedAt: Date }[];
  initiativesWon: { assigneeId: string | null; closedAt: Date }[];
  // Discipline.
  updates: { authorId: string; projectId: string; createdAt: Date }[];
  /** Point-in-time — already filtered to the penalized fight types. */
  overdueOwned: { responsibleId: string }[];
  decisionsAutoProceeded: { requestedFromId: string; decidedAt: Date }[];
  // Initiative-taking (CANCELLED rows must be excluded by the loader —
  // file-and-cancel farms nothing).
  proposalsFiled: { createdById: string | null; createdAt: Date }[];
  blockersRaised: { raisedById: string | null; createdAt: Date }[];
  tasksFiled: { requesterId: string; createdAt: Date }[];
  dataRequestsFiled: { requesterId: string; createdAt: Date }[];
  initiativesFiled: { requesterId: string; createdAt: Date }[];
}

export interface PerformanceConfig {
  weights: Record<PerformanceMetric, number>;
  windowDays: number;
  /** Counted updates per author per project per ISO week; 0 disables. */
  updatesCapPerProjectPerWeek: number;
  /** Decisions are "on time" when decided within this many hours. */
  decisionTimeoutHours: number;
}

export interface ScoreBreakdown {
  person: PersonEntry;
  total: number;
  perCategory: Record<PerformanceCategory, number>;
  /** Counted units per metric, AFTER caps — multiply by weights for points. */
  perMetric: Record<PerformanceMetric, number>;
}

/** Same day-granularity rule as isOverdue: the whole due day still counts. */
function onTime(completedAt: Date, due: Date): boolean {
  return differenceInDays(completedAt, due) <= 0;
}

export function computeScores(
  input: PerformanceInput,
  config: PerformanceConfig,
  now: Date
): ScoreBreakdown[] {
  const windowStart = subDays(now, config.windowDays);
  const inWindow = (d: Date) => d.getTime() >= windowStart.getTime() && d.getTime() <= now.getTime();

  const counts = new Map<string, Record<PerformanceMetric, number>>();
  for (const p of input.people) {
    counts.set(
      p.id,
      Object.fromEntries(PERFORMANCE_METRICS.map((m) => [m, 0])) as Record<
        PerformanceMetric,
        number
      >
    );
  }
  const bump = (personId: string | null | undefined, metric: PerformanceMetric, by = 1) => {
    if (!personId) return;
    const row = counts.get(personId);
    if (row) row[metric] += by;
  };

  for (const m of input.milestonesDone) {
    if (!inWindow(m.completedAt)) continue;
    bump(m.ownerId, "milestoneDone");
    if (onTime(m.completedAt, m.dueDate)) bump(m.ownerId, "milestoneOnTime");
  }
  for (const b of input.blockersResolved) {
    if (inWindow(b.resolvedAt)) bump(b.ownerId, "blockerResolved");
  }
  for (const t of input.tasksDone) {
    if (!inWindow(t.completedAt)) continue;
    bump(t.assigneeId, "taskDone");
    if (onTime(t.completedAt, t.deadline)) bump(t.assigneeId, "taskOnTime");
  }
  for (const dr of input.dataRequestsDelivered) {
    if (!inWindow(dr.deliveredAt)) continue;
    bump(dr.assigneeId, "dataRequestDelivered");
    if (onTime(dr.deliveredAt, dr.neededBy)) bump(dr.assigneeId, "dataRequestOnTime");
  }
  for (const d of input.decisionsDecided) {
    if (!inWindow(d.decidedAt)) continue;
    bump(d.decidedById, "decisionDecided");
    if (d.decidedAt.getTime() <= addHours(d.createdAt, config.decisionTimeoutHours).getTime()) {
      bump(d.decidedById, "decisionOnTime");
    }
  }
  for (const c of input.computeDecided) {
    if (inWindow(c.decidedAt)) bump(c.decidedById, "computeDecided");
  }
  for (const c of input.computeResultsSubmitted) {
    if (inWindow(c.completedAt)) bump(c.requesterId, "computeResultsSubmitted");
  }
  for (const i of input.initiativesWon) {
    if (inWindow(i.closedAt)) bump(i.assigneeId, "initiativeWon");
  }

  // Updates: capped per author per project per ISO week (anti-spam).
  if (config.updatesCapPerProjectPerWeek > 0) {
    const perKey = new Map<string, number>();
    for (const u of input.updates) {
      if (!inWindow(u.createdAt)) continue;
      const key = `${u.authorId}|${u.projectId}|${startOfISOWeek(u.createdAt).getTime()}`;
      const seen = perKey.get(key) ?? 0;
      if (seen < config.updatesCapPerProjectPerWeek) {
        perKey.set(key, seen + 1);
        bump(u.authorId, "updatePosted");
      }
    }
  }

  for (const o of input.overdueOwned) {
    bump(o.responsibleId, "overdueOwnedItem");
  }
  for (const d of input.decisionsAutoProceeded) {
    if (inWindow(d.decidedAt)) bump(d.requestedFromId, "decisionAutoProceeded");
  }

  for (const p of input.proposalsFiled) {
    if (inWindow(p.createdAt)) bump(p.createdById, "proposalFiled");
  }
  for (const b of input.blockersRaised) {
    if (inWindow(b.createdAt)) bump(b.raisedById, "blockerRaised");
  }
  for (const t of input.tasksFiled) {
    if (inWindow(t.createdAt)) bump(t.requesterId, "taskFiled");
  }
  for (const dr of input.dataRequestsFiled) {
    if (inWindow(dr.createdAt)) bump(dr.requesterId, "dataRequestFiled");
  }
  for (const i of input.initiativesFiled) {
    if (inWindow(i.createdAt)) bump(i.requesterId, "initiativeFiled");
  }

  const results: ScoreBreakdown[] = input.people.map((person) => {
    const perMetric = counts.get(person.id)!;
    const perCategory = Object.fromEntries(
      PERFORMANCE_CATEGORIES.map((c) => [c, 0])
    ) as Record<PerformanceCategory, number>;
    let total = 0;
    for (const metric of PERFORMANCE_METRICS) {
      const points = perMetric[metric] * (config.weights[metric] ?? 0);
      perCategory[METRIC_CATEGORY[metric]] += points;
      total += points;
    }
    return { person, total, perCategory, perMetric };
  });

  return results.sort(
    (a, b) => b.total - a.total || a.person.name.localeCompare(b.person.name)
  );
}
