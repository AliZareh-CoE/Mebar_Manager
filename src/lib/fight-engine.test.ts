import { describe, expect, it } from "vitest";
import { subDays, subHours, addDays } from "date-fns";
import {
  computeFightList,
  computeParetoData,
  projectAgeDays,
  isOverdue,
  type LabSnapshot,
  type ProjectRow,
  type BlockerRow,
  type DecisionRow,
  type MilestoneRow,
} from "./fight-engine";

const NOW = new Date("2026-07-14T12:00:00Z");
const alice = { id: "u-alice", name: "Alice" };
const prof = { id: "u-prof", name: "Prof" };

function project(over: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "p1",
    title: "Test project",
    state: "ACTIVE",
    createdAt: subDays(NOW, 60),
    lastUpdateAt: subDays(NOW, 1),
    pauseReason: null,
    reviveDate: null,
    owner: alice,
    advisor: prof,
    ...over,
  };
}

function blocker(over: Partial<BlockerRow> = {}): BlockerRow {
  return {
    id: "b1",
    projectId: "p1",
    description: "Stuck on the laser alignment",
    causeTag: "TECHNICAL",
    ownerId: alice.id,
    owner: alice,
    deadline: addDays(NOW, 3),
    status: "OPEN",
    createdAt: subDays(NOW, 1),
    ...over,
  };
}

function decision(over: Partial<DecisionRow> = {}): DecisionRow {
  return {
    id: "d1",
    projectId: "p1",
    question: "Buy or build the stage controller?",
    recommendation: "Buy",
    requestedFrom: prof,
    status: "PENDING",
    createdAt: subHours(NOW, 4),
    ...over,
  };
}

function milestone(over: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id: "m1",
    projectId: "p1",
    title: "First interferogram",
    dueDate: addDays(NOW, 7),
    status: "IN_PROGRESS",
    ...over,
  };
}

function snap(over: Partial<LabSnapshot> = {}): LabSnapshot {
  return {
    projects: [project()],
    openBlockers: [],
    pendingDecisions: [],
    openMilestones: [],
    ...over,
  };
}

describe("empty and healthy labs", () => {
  it("empty snapshot → no fights", () => {
    expect(computeFightList(snap({ projects: [] }), NOW)).toEqual([]);
  });

  it("healthy project → no fights", () => {
    expect(computeFightList(snap(), NOW)).toEqual([]);
  });
});

describe("STALLED_PROJECT", () => {
  it("13 days silent is fine, 15 days is stalled with ageDays=1", () => {
    const fine = snap({ projects: [project({ lastUpdateAt: subDays(NOW, 13) })] });
    expect(computeFightList(fine, NOW)).toEqual([]);

    const stalled = snap({ projects: [project({ lastUpdateAt: subDays(NOW, 15) })] });
    const items = computeFightList(stalled, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "STALLED_PROJECT",
      severity: 3,
      ageDays: 1,
      responsible: alice,
    });
  });

  it("falls back to createdAt when there is no update at all", () => {
    const items = computeFightList(
      snap({ projects: [project({ lastUpdateAt: null, createdAt: subDays(NOW, 20) })] }),
      NOW
    );
    expect(items[0]?.type).toBe("STALLED_PROJECT");
  });

  it("only ACTIVE and BLOCKED projects can stall", () => {
    for (const state of ["PROPOSAL", "SCOPING", "DONE", "KILLED"] as const) {
      const items = computeFightList(
        snap({ projects: [project({ state, lastUpdateAt: subDays(NOW, 30) })] }),
        NOW
      );
      expect(items).toEqual([]);
    }
  });
});

describe("blockers", () => {
  it("blocker due yesterday is overdue, sev 3, yells at its owner", () => {
    const items = computeFightList(
      snap({ openBlockers: [blocker({ deadline: subDays(NOW, 1) })] }),
      NOW
    );
    expect(items[0]).toMatchObject({
      type: "OVERDUE_BLOCKER",
      severity: 3,
      ageDays: 1,
      responsible: alice,
    });
  });

  it("unowned overdue blocker yells at the advisor instead", () => {
    const items = computeFightList(
      snap({
        openBlockers: [blocker({ deadline: subDays(NOW, 2), ownerId: null, owner: null })],
      }),
      NOW
    );
    expect(items[0]?.responsible).toEqual(prof);
  });

  it("unowned at 1 day is silent, at 3 days it flags for the advisor", () => {
    const young = snap({
      openBlockers: [blocker({ ownerId: null, owner: null, createdAt: subDays(NOW, 1) })],
    });
    expect(computeFightList(young, NOW)).toEqual([]);

    const old = snap({
      openBlockers: [blocker({ ownerId: null, owner: null, createdAt: subDays(NOW, 3) })],
    });
    const items = computeFightList(old, NOW);
    expect(items[0]).toMatchObject({
      type: "UNOWNED_BLOCKER",
      severity: 2,
      ageDays: 1,
      responsible: prof,
    });
  });

  it("escalating an unowned blocker keeps it on the list at higher severity", () => {
    // Even a young escalated blocker fights — escalation must never hide it.
    const items = computeFightList(
      snap({
        openBlockers: [
          blocker({ status: "ESCALATED", ownerId: null, owner: null, createdAt: subDays(NOW, 1) }),
        ],
      }),
      NOW
    );
    expect(items[0]).toMatchObject({
      type: "UNOWNED_BLOCKER",
      severity: 3,
      responsible: prof,
    });
    expect(items[0]?.headline).toContain("Escalated");
  });

  it("a blocker raises at most one fight (overdue wins over unowned)", () => {
    const items = computeFightList(
      snap({
        openBlockers: [
          blocker({ ownerId: null, owner: null, createdAt: subDays(NOW, 5), deadline: subDays(NOW, 1) }),
        ],
      }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("OVERDUE_BLOCKER");
  });

  it("blockers on paused/done projects don't fight", () => {
    const items = computeFightList(
      snap({
        projects: [project({ state: "PAUSED", pauseReason: "x", reviveDate: addDays(NOW, 5) })],
        openBlockers: [blocker({ deadline: subDays(NOW, 3) })],
      }),
      NOW
    );
    expect(items).toEqual([]);
  });
});

describe("PENDING_DECISION", () => {
  it("fresh decision is sev 2 with a countdown headline", () => {
    const items = computeFightList(snap({ pendingDecisions: [decision()] }), NOW);
    expect(items[0]).toMatchObject({ type: "PENDING_DECISION", severity: 2 });
    expect(items[0]?.headline).toContain("auto-proceeds in 44h");
  });

  it("decision in its last 12 hours turns sev 3", () => {
    const items = computeFightList(
      snap({ pendingDecisions: [decision({ createdAt: subHours(NOW, 40) })] }),
      NOW
    );
    expect(items[0]?.severity).toBe(3);
  });

  it("decision in its last hour says so instead of claiming auto-proceeded", () => {
    const items = computeFightList(
      // 47.5h old → 30 minutes left
      snap({ pendingDecisions: [decision({ createdAt: new Date(NOW.getTime() - 47.5 * 3_600_000) })] }),
      NOW
    );
    expect(items[0]?.headline).toContain("under an hour");
    expect(items[0]?.severity).toBe(3);
  });

  it("decisions on paused/terminal projects don't fight", () => {
    for (const state of ["PAUSED", "DONE", "KILLED"] as const) {
      const items = computeFightList(
        snap({
          projects: [
            project({
              state,
              pauseReason: state === "PAUSED" ? "x" : null,
              reviveDate: state === "PAUSED" ? addDays(NOW, 5) : null,
            }),
          ],
          pendingDecisions: [decision()],
        }),
        NOW
      );
      expect(items).toEqual([]);
    }
  });
});

describe("isOverdue", () => {
  it("gives the full due day before turning red", () => {
    const dueMidnight = new Date("2026-07-14T00:00:00Z");
    expect(isOverdue(dueMidnight, NOW)).toBe(false); // due today, noon
    expect(isOverdue(dueMidnight, new Date("2026-07-15T00:00:01Z"))).toBe(true);
    expect(isOverdue(addDays(NOW, 3), NOW)).toBe(false);
  });
});

describe("PAST_REVIVE", () => {
  it("paused past its revive date demands revive-or-kill from the advisor", () => {
    const items = computeFightList(
      snap({
        projects: [
          project({ state: "PAUSED", pauseReason: "Vendor delay", reviveDate: subDays(NOW, 10) }),
        ],
      }),
      NOW
    );
    expect(items[0]).toMatchObject({
      type: "PAST_REVIVE",
      severity: 3,
      ageDays: 10,
      responsible: prof,
    });
  });

  it("paused with a future revive date is at peace", () => {
    const items = computeFightList(
      snap({
        projects: [project({ state: "PAUSED", pauseReason: "x", reviveDate: addDays(NOW, 5) })],
      }),
      NOW
    );
    expect(items).toEqual([]);
  });
});

describe("MISSED_MILESTONE", () => {
  it("past-due milestone flags while the project is moving", () => {
    const items = computeFightList(
      snap({ openMilestones: [milestone({ dueDate: subDays(NOW, 3) })] }),
      NOW
    );
    expect(items[0]).toMatchObject({ type: "MISSED_MILESTONE", severity: 2, ageDays: 3 });
  });

  it("no milestone fights on paused projects", () => {
    const items = computeFightList(
      snap({
        projects: [project({ state: "PAUSED", pauseReason: "x", reviveDate: addDays(NOW, 5) })],
        openMilestones: [milestone({ dueDate: subDays(NOW, 3) })],
      }),
      NOW
    );
    expect(items).toEqual([]);
  });
});

describe("sorting", () => {
  it("severity 3 before 2, older first within severity", () => {
    const items = computeFightList(
      snap({
        projects: [
          project({ id: "p1", title: "A", lastUpdateAt: subDays(NOW, 16) }), // sev3 age2
          project({ id: "p2", title: "B", lastUpdateAt: subDays(NOW, 20) }), // sev3 age6
        ],
        openMilestones: [milestone({ projectId: "p1", dueDate: subDays(NOW, 30) })], // sev2 age30
      }),
      NOW
    );
    expect(items.map((i) => [i.type, i.ageDays])).toEqual([
      ["STALLED_PROJECT", 6],
      ["STALLED_PROJECT", 2],
      ["MISSED_MILESTONE", 30],
    ]);
  });
});

describe("projectAgeDays", () => {
  it("uses last update when present, createdAt otherwise, never negative", () => {
    expect(projectAgeDays(subDays(NOW, 5), subDays(NOW, 50), NOW)).toBe(5);
    expect(projectAgeDays(null, subDays(NOW, 50), NOW)).toBe(50);
    expect(projectAgeDays(addDays(NOW, 1), subDays(NOW, 50), NOW)).toBe(0);
  });
});

describe("computeParetoData", () => {
  it("counts, percentages, sorted desc", () => {
    const data = computeParetoData([
      { causeTag: "WAITING_DECISION" },
      { causeTag: "WAITING_DECISION" },
      { causeTag: "WAITING_DECISION" },
      { causeTag: "TECHNICAL" },
    ]);
    expect(data).toEqual([
      { causeTag: "WAITING_DECISION", count: 3, pct: 75 },
      { causeTag: "TECHNICAL", count: 1, pct: 25 },
    ]);
  });

  it("empty input → empty output", () => {
    expect(computeParetoData([])).toEqual([]);
  });
});
