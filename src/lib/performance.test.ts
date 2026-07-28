import { describe, expect, it } from "vitest";
import { subDays, subHours } from "date-fns";
import { computeScores, firstStateEntries, type PerformanceInput, type PerformanceConfig } from "./performance";
import { DEFAULT_PERFORMANCE_WEIGHTS } from "./performance-metrics";

const NOW = new Date("2026-07-14T12:00:00Z");

const alice = { id: "u-a", name: "Alice", role: "ENGINEER", isDataAnalyst: false, isComputeCoordinator: false };
const bob = { id: "u-b", name: "Bob", role: "ENGINEER", isDataAnalyst: false, isComputeCoordinator: false };
const prof = { id: "u-p", name: "Prof", role: "MANAGER", isDataAnalyst: false, isComputeCoordinator: true };

function input(over: Partial<PerformanceInput> = {}): PerformanceInput {
  return {
    people: [alice, bob, prof],
    milestonesDone: [],
    blockersResolved: [],
    tasksDone: [],
    dataRequestsDelivered: [],
    decisionsDecided: [],
    computeDecided: [],
    computeResultsSubmitted: [],
    initiativesWon: [],
    updates: [],
    overdueOwned: [],
    decisionsAutoProceeded: [],
    proposalsFiled: [],
    blockersRaised: [],
    tasksFiled: [],
    dataRequestsFiled: [],
    initiativesFiled: [],
    ...over,
  };
}

function config(over: Partial<PerformanceConfig> = {}): PerformanceConfig {
  return {
    weights: { ...DEFAULT_PERFORMANCE_WEIGHTS },
    windowDays: 90,
    updatesCapPerProjectPerWeek: 3,
    decisionTimeoutHours: 48,
    ...over,
  };
}

const scoreOf = (results: ReturnType<typeof computeScores>, id: string) =>
  results.find((r) => r.person.id === id)!;

describe("computeScores", () => {
  it("everyone appears, zeros included, sorted by total then name", () => {
    const results = computeScores(
      input({ blockersResolved: [{ ownerId: bob.id, resolvedAt: subDays(NOW, 1) }] }),
      config(),
      NOW
    );
    expect(results.map((r) => r.person.id)).toEqual([bob.id, alice.id, prof.id]);
    expect(scoreOf(results, alice.id).total).toBe(0);
  });

  it("window edges: inside counts, outside doesn't", () => {
    const results = computeScores(
      input({
        blockersResolved: [
          { ownerId: alice.id, resolvedAt: subDays(NOW, 89) },
          { ownerId: alice.id, resolvedAt: subDays(NOW, 91) },
        ],
      }),
      config(),
      NOW
    );
    expect(scoreOf(results, alice.id).perMetric.blockerResolved).toBe(1);
  });

  it("on-time bonuses stack on the base metric (whole due day granted)", () => {
    const due = subDays(NOW, 10);
    const results = computeScores(
      input({
        milestonesDone: [
          { ownerId: alice.id, completedAt: due, dueDate: due }, // same day = on time
          { ownerId: alice.id, completedAt: subDays(NOW, 2), dueDate: due }, // late
        ],
      }),
      config(),
      NOW
    );
    const a = scoreOf(results, alice.id);
    expect(a.perMetric.milestoneDone).toBe(2);
    expect(a.perMetric.milestoneOnTime).toBe(1);
    expect(a.perCategory.DELIVERY).toBe(2 * 3 + 1 * 1);
  });

  it("decision on-time uses the configured timeout", () => {
    const created = subDays(NOW, 5);
    const results = computeScores(
      input({
        decisionsDecided: [
          { decidedById: prof.id, createdAt: created, decidedAt: subHours(NOW, 96) }, // 24h later: on time
          { decidedById: prof.id, createdAt: created, decidedAt: subHours(NOW, 24) }, // 96h later: late
        ],
      }),
      config({ decisionTimeoutHours: 48 }),
      NOW
    );
    const p = scoreOf(results, prof.id);
    expect(p.perMetric.decisionDecided).toBe(2);
    expect(p.perMetric.decisionOnTime).toBe(1);
  });

  it("compute verdicts credit the coordinator (we spare no one)", () => {
    const results = computeScores(
      input({ computeDecided: [{ decidedById: prof.id, decidedAt: subDays(NOW, 3) }] }),
      config(),
      NOW
    );
    expect(scoreOf(results, prof.id).perMetric.computeDecided).toBe(1);
  });

  it("update cap: same project+week capped, spread across weeks not", () => {
    const sameWeek = [0, 1, 2, 3].map((h) => ({
      authorId: alice.id,
      projectId: "p1",
      createdAt: subHours(NOW, h + 1),
    }));
    const spread = [0, 8, 16, 24].map((d) => ({
      authorId: bob.id,
      projectId: "p1",
      createdAt: subDays(NOW, d + 1),
    }));
    const results = computeScores(
      input({ updates: [...sameWeek, ...spread] }),
      config({ updatesCapPerProjectPerWeek: 3 }),
      NOW
    );
    expect(scoreOf(results, alice.id).perMetric.updatePosted).toBe(3);
    expect(scoreOf(results, bob.id).perMetric.updatePosted).toBe(4);
  });

  it("cap of 0 disables update credit entirely", () => {
    const results = computeScores(
      input({ updates: [{ authorId: alice.id, projectId: "p1", createdAt: subDays(NOW, 1) }] }),
      config({ updatesCapPerProjectPerWeek: 0 }),
      NOW
    );
    expect(scoreOf(results, alice.id).perMetric.updatePosted).toBe(0);
  });

  it("penalties go negative: overdue items and auto-proceeded decisions", () => {
    const results = computeScores(
      input({
        overdueOwned: [{ responsibleId: alice.id }, { responsibleId: alice.id }],
        decisionsAutoProceeded: [{ requestedFromId: prof.id, decidedAt: subDays(NOW, 2) }],
      }),
      config(),
      NOW
    );
    expect(scoreOf(results, alice.id).perCategory.DISCIPLINE).toBe(2 * -2);
    expect(scoreOf(results, prof.id).perCategory.DISCIPLINE).toBe(-3);
  });

  it("null credit fields never count (legacy rows, unowned resolutions)", () => {
    const results = computeScores(
      input({
        blockersResolved: [{ ownerId: null, resolvedAt: subDays(NOW, 1) }],
        blockersRaised: [{ raisedById: null, createdAt: subDays(NOW, 1) }],
        proposalsFiled: [{ createdById: null, createdAt: subDays(NOW, 1) }],
      }),
      config(),
      NOW
    );
    for (const r of results) expect(r.total).toBe(0);
  });

  it("weight overrides change the math", () => {
    const results = computeScores(
      input({ initiativesWon: [{ assigneeId: prof.id, closedAt: subDays(NOW, 1) }] }),
      config({ weights: { ...DEFAULT_PERFORMANCE_WEIGHTS, initiativeWon: 10 } }),
      NOW
    );
    expect(scoreOf(results, prof.id).total).toBe(10);
  });

  it("unknown people in events are ignored (banned users)", () => {
    const results = computeScores(
      input({ blockersResolved: [{ ownerId: "u-ghost", resolvedAt: subDays(NOW, 1) }] }),
      config(),
      NOW
    );
    expect(results).toHaveLength(3);
    for (const r of results) expect(r.total).toBe(0);
  });
});

describe("paper metrics (v6)", () => {
  it("credits the project owner for submission and acceptance", () => {
    const results = computeScores(
      input({
        papersSubmitted: [{ ownerId: alice.id, submittedAt: subDays(NOW, 10) }],
        papersAccepted: [{ ownerId: alice.id, acceptedAt: subDays(NOW, 2) }],
      }),
      config(),
      NOW
    );
    const a = scoreOf(results, alice.id);
    expect(a.perMetric.paperSubmitted).toBe(1);
    expect(a.perMetric.paperAccepted).toBe(1);
    expect(a.perCategory.DELIVERY).toBe(
      DEFAULT_PERFORMANCE_WEIGHTS.paperSubmitted + DEFAULT_PERFORMANCE_WEIGHTS.paperAccepted
    );
  });

  it("window edges: events outside the window earn nothing", () => {
    const results = computeScores(
      input({
        papersSubmitted: [{ ownerId: alice.id, submittedAt: subDays(NOW, 91) }],
        papersAccepted: [{ ownerId: alice.id, acceptedAt: subDays(NOW, 91) }],
      }),
      config({ windowDays: 90 }),
      NOW
    );
    const a = scoreOf(results, alice.id);
    expect(a.perMetric.paperSubmitted).toBe(0);
    expect(a.perMetric.paperAccepted).toBe(0);
  });

  it("null owner (deleted account) earns nobody anything", () => {
    const results = computeScores(
      input({ papersSubmitted: [{ ownerId: null, submittedAt: subDays(NOW, 1) }] }),
      config(),
      NOW
    );
    for (const r of results) expect(r.perMetric.paperSubmitted).toBe(0);
  });

  it("inputs without the paper arrays (pre-v6 shape) still compute", () => {
    const results = computeScores(input(), config(), NOW);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.perMetric.paperSubmitted).toBe(0);
      expect(r.perMetric.paperAccepted).toBe(0);
    }
  });
});

describe("stageReached (state points)", () => {
  it("sums the state's points to the owner, window-guarded", () => {
    const results = computeScores(
      input({
        stagesReached: [
          { personId: alice.id, points: 5, reachedAt: subDays(NOW, 2) },
          { personId: alice.id, points: 3, reachedAt: subDays(NOW, 4) },
          { personId: alice.id, points: 50, reachedAt: subDays(NOW, 400) }, // out of window
          { personId: null, points: 9, reachedAt: subDays(NOW, 1) }, // accountless
        ],
      }),
      config(),
      NOW
    );
    const u1 = results.find((r) => r.person.id === alice.id)!;
    expect(u1.perMetric.stageReached).toBe(8);
  });

  it("zero-point entries add nothing; absent array still computes", () => {
    const withZero = computeScores(
      input({ stagesReached: [{ personId: alice.id, points: 0, reachedAt: subDays(NOW, 1) }] }),
      config(),
      NOW
    );
    expect(withZero.find((r) => r.person.id === alice.id)!.perMetric.stageReached).toBe(0);
    const absent = computeScores(input(), config(), NOW);
    for (const r of absent) expect(r.perMetric.stageReached).toBe(0);
  });
});

describe("falseResolution (dispute penalty)", () => {
  it("counts window-guarded disputes against the penalized person", () => {
    const results = computeScores(
      input({
        falseResolutions: [
          { personId: alice.id, at: subDays(NOW, 2) },
          { personId: alice.id, at: subDays(NOW, 5) },
          { personId: alice.id, at: subDays(NOW, 400) }, // out of window
          { personId: null, at: subDays(NOW, 1) }, // ownerless dispute
        ],
      }),
      config(),
      NOW
    );
    const u1 = results.find((r) => r.person.id === alice.id)!;
    expect(u1.perMetric.falseResolution).toBe(2);
  });

  it("absent array still computes", () => {
    const absent = computeScores(input(), config(), NOW);
    for (const r of absent) expect(r.perMetric.falseResolution).toBe(0);
  });
});

describe("firstStateEntries", () => {
  it("keeps only the oldest entry per project+state, order-tolerant", () => {
    const out = firstStateEntries([
      { projectId: "p1", toState: "ACTIVE", createdAt: subDays(NOW, 1) },
      { projectId: "p1", toState: "ACTIVE", createdAt: subDays(NOW, 10) },
      { projectId: "p1", toState: "BLOCKED", createdAt: subDays(NOW, 5) },
      { projectId: "p2", toState: "ACTIVE", createdAt: subDays(NOW, 3) },
    ]);
    expect(out).toHaveLength(3);
    const p1Active = out.find((t) => t.projectId === "p1" && t.toState === "ACTIVE")!;
    expect(p1Active.createdAt).toEqual(subDays(NOW, 10));
  });
});
