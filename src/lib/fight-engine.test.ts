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
  type DataRequestRow,
  type ComputeRequestRow,
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
    lastActivatedAt: null,
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

function dataRequest(over: Partial<DataRequestRow> = {}): DataRequestRow {
  return {
    id: "dr1",
    projectId: "p1",
    title: "Wafer defect image archive, labeled, 2019-2024",
    neededBy: addDays(NOW, 7),
    createdAt: subDays(NOW, 1),
    status: "OPEN",
    assigneeId: alice.id,
    assignee: alice,
    ...over,
  };
}

function computeRequest(over: Partial<ComputeRequestRow> = {}): ComputeRequestRow {
  return {
    id: "cr1",
    projectId: "p1",
    serverType: "SINGLE_GPU",
    hoursNeeded: 48,
    status: "PENDING",
    createdAt: subHours(NOW, 4),
    requester: alice,
    windowEnd: null,
    ...over,
  };
}

function snap(over: Partial<LabSnapshot> = {}): LabSnapshot {
  return {
    projects: [project()],
    openBlockers: [],
    pendingDecisions: [],
    openMilestones: [],
    openDataRequests: [],
    activeComputeRequests: [],
    computeCoordinator: prof,
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

  it("a fresh activation resets the stall clock (start/revive/unblock)", () => {
    // 20-day-old proposal approved+started today: not stalled.
    const started = snap({
      projects: [
        project({
          createdAt: subDays(NOW, 20),
          lastUpdateAt: null,
          lastActivatedAt: subDays(NOW, 0),
        }),
      ],
    });
    expect(computeFightList(started, NOW)).toEqual([]);

    // Revived 3 days ago after a 2-month pause: not stalled either.
    const revived = snap({
      projects: [
        project({
          lastUpdateAt: subDays(NOW, 60),
          lastActivatedAt: subDays(NOW, 3),
        }),
      ],
    });
    expect(computeFightList(revived, NOW)).toEqual([]);

    // But an activation 15 days ago with no update since: stalled.
    const idleAfterStart = snap({
      projects: [
        project({ lastUpdateAt: null, lastActivatedAt: subDays(NOW, 15) }),
      ],
    });
    expect(computeFightList(idleAfterStart, NOW)[0]?.type).toBe("STALLED_PROJECT");
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

  it("escalated unowned blocker past the grace period still fights (sev 3, advisor)", () => {
    const items = computeFightList(
      snap({
        openBlockers: [
          blocker({ ownerId: null, owner: null, status: "ESCALATED", createdAt: subDays(NOW, 3) }),
        ],
      }),
      NOW
    );
    expect(items[0]).toMatchObject({
      type: "UNOWNED_BLOCKER",
      severity: 3,
      responsible: prof,
    });
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

describe("data requests", () => {
  it("healthy assigned request → no fight", () => {
    expect(computeFightList(snap({ openDataRequests: [dataRequest()] }), NOW)).toEqual([]);
  });

  it("not overdue on the needed-by day itself, overdue the day after (sev 3, assignee)", () => {
    const onDay = snap({ openDataRequests: [dataRequest({ neededBy: NOW })] });
    expect(computeFightList(onDay, NOW)).toEqual([]);

    const items = computeFightList(
      snap({ openDataRequests: [dataRequest({ neededBy: subDays(NOW, 1) })] }),
      NOW
    );
    expect(items[0]).toMatchObject({
      type: "OVERDUE_DATA_REQUEST",
      severity: 3,
      ageDays: 1,
      responsible: alice,
    });
  });

  it("overdue unassigned request yells at the advisor", () => {
    const items = computeFightList(
      snap({
        openDataRequests: [
          dataRequest({ neededBy: subDays(NOW, 2), assigneeId: null, assignee: null }),
        ],
      }),
      NOW
    );
    expect(items[0]?.responsible).toEqual(prof);
  });

  it("unowned at 1 day is silent, at 3 days it flags for the advisor (sev 2)", () => {
    const young = snap({
      openDataRequests: [dataRequest({ assigneeId: null, assignee: null, createdAt: subDays(NOW, 1) })],
    });
    expect(computeFightList(young, NOW)).toEqual([]);

    const items = computeFightList(
      snap({
        openDataRequests: [
          dataRequest({ assigneeId: null, assignee: null, createdAt: subDays(NOW, 3) }),
        ],
      }),
      NOW
    );
    expect(items[0]).toMatchObject({
      type: "UNOWNED_DATA_REQUEST",
      severity: 2,
      ageDays: 1,
      responsible: prof,
    });
  });

  it("a request raises at most one fight (overdue wins over unowned)", () => {
    const items = computeFightList(
      snap({
        openDataRequests: [
          dataRequest({
            assigneeId: null,
            assignee: null,
            createdAt: subDays(NOW, 10),
            neededBy: subDays(NOW, 2),
          }),
        ],
      }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("OVERDUE_DATA_REQUEST");
  });

  it("delivered requests and paused/terminal projects don't fight", () => {
    const delivered = snap({
      openDataRequests: [dataRequest({ status: "DELIVERED", neededBy: subDays(NOW, 5) })],
    });
    expect(computeFightList(delivered, NOW)).toEqual([]);

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
          openDataRequests: [dataRequest({ neededBy: subDays(NOW, 5) })],
        }),
        NOW
      );
      expect(items).toEqual([]);
    }
  });
});

describe("compute requests", () => {
  it("every pending request on a moving project fights (sev 2 fresh), aimed at the coordinator", () => {
    const items = computeFightList(
      snap({ activeComputeRequests: [computeRequest()] }),
      NOW
    );
    expect(items[0]).toMatchObject({
      type: "PENDING_COMPUTE_REQUEST",
      severity: 2,
      responsible: prof,
    });
    expect(items[0]?.headline).toContain("SINGLE-GPU");
    expect(items[0]?.headline).toContain("48h");
  });

  it("sev 2 at 47h, still 2 at exactly 48h, sev 3 at 49h — but never auto-proceeds", () => {
    const at47 = computeFightList(
      snap({ activeComputeRequests: [computeRequest({ createdAt: subHours(NOW, 47) })] }),
      NOW
    );
    expect(at47[0]?.severity).toBe(2);

    const at48 = computeFightList(
      snap({ activeComputeRequests: [computeRequest({ createdAt: subHours(NOW, 48) })] }),
      NOW
    );
    expect(at48[0]?.severity).toBe(2);

    const at49 = computeFightList(
      snap({ activeComputeRequests: [computeRequest({ createdAt: subHours(NOW, 49) })] }),
      NOW
    );
    expect(at49[0]).toMatchObject({ type: "PENDING_COMPUTE_REQUEST", severity: 3 });
  });

  it("responsible is null when no coordinator is set — the item still shows", () => {
    const items = computeFightList(
      snap({ activeComputeRequests: [computeRequest()], computeCoordinator: null }),
      NOW
    );
    expect(items[0]?.responsible).toBeNull();
  });

  it("pending requests on paused projects don't fight", () => {
    const items = computeFightList(
      snap({
        projects: [project({ state: "PAUSED", pauseReason: "x", reviveDate: addDays(NOW, 5) })],
        activeComputeRequests: [computeRequest()],
      }),
      NOW
    );
    expect(items).toEqual([]);
  });

  it("results owed: nothing at windowEnd, sev 2 at +1d, sev 3 at +8d, yells at requester", () => {
    const approved = (windowEnd: Date) =>
      snap({
        activeComputeRequests: [computeRequest({ status: "APPROVED", windowEnd })],
      });

    expect(computeFightList(approved(NOW), NOW)).toEqual([]);

    const oneDay = computeFightList(approved(subDays(NOW, 1)), NOW);
    expect(oneDay[0]).toMatchObject({
      type: "OVERDUE_COMPUTE_RESULTS",
      severity: 2,
      ageDays: 1,
      responsible: alice,
    });

    const eightDays = computeFightList(approved(subDays(NOW, 8)), NOW);
    expect(eightDays[0]?.severity).toBe(3);
  });

  it("the results debt survives a pause — the hours were burned", () => {
    const items = computeFightList(
      snap({
        projects: [project({ state: "PAUSED", pauseReason: "x", reviveDate: addDays(NOW, 5) })],
        activeComputeRequests: [
          computeRequest({ status: "APPROVED", windowEnd: subDays(NOW, 3) }),
        ],
      }),
      NOW
    );
    expect(items[0]?.type).toBe("OVERDUE_COMPUTE_RESULTS");
  });

  it("denied/completed requests never fight", () => {
    for (const status of ["DENIED", "COMPLETED"] as const) {
      const items = computeFightList(
        snap({
          activeComputeRequests: [
            computeRequest({ status, windowEnd: subDays(NOW, 10) }),
          ],
        }),
        NOW
      );
      expect(items).toEqual([]);
    }
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
  const base = { createdAt: subDays(NOW, 50) };

  it("uses the freshest of update, activation, and creation; never negative", () => {
    expect(projectAgeDays({ ...base, lastUpdateAt: subDays(NOW, 5), lastActivatedAt: null }, NOW)).toBe(5);
    expect(projectAgeDays({ ...base, lastUpdateAt: null, lastActivatedAt: null }, NOW)).toBe(50);
    expect(projectAgeDays({ ...base, lastUpdateAt: subDays(NOW, 20), lastActivatedAt: subDays(NOW, 2) }, NOW)).toBe(2);
    expect(projectAgeDays({ ...base, lastUpdateAt: addDays(NOW, 1), lastActivatedAt: null }, NOW)).toBe(0);
  });
});

describe("cancelled and withdrawn items never fight", () => {
  it("cancelled blocker, milestone, and data request are silent", () => {
    const items = computeFightList(
      snap({
        openBlockers: [blocker({ status: "CANCELLED", deadline: subDays(NOW, 10) })],
        openMilestones: [milestone({ status: "CANCELLED", dueDate: subDays(NOW, 10) })],
        openDataRequests: [dataRequest({ status: "CANCELLED", neededBy: subDays(NOW, 10) })],
      }),
      NOW
    );
    expect(items).toEqual([]);
  });

  it("cancelled decision and withdrawn compute request are silent", () => {
    const items = computeFightList(
      snap({
        pendingDecisions: [decision({ status: "CANCELLED", createdAt: subDays(NOW, 10) })],
        activeComputeRequests: [
          computeRequest({ status: "WITHDRAWN", createdAt: subDays(NOW, 10) }),
        ],
      }),
      NOW
    );
    expect(items).toEqual([]);
  });
});

describe("custom thresholds", () => {
  const custom = {
    stallDays: 30,
    unownedGraceDays: 2,
    decisionTimeoutHours: 48,
    decisionUrgentHours: 24,
    computePendingUrgentHours: 48,
    computeResultsUrgentDays: 1,
  };

  it("stallDays 30 un-stalls a 21-day-silent project", () => {
    const s = snap({ projects: [project({ lastUpdateAt: subDays(NOW, 21) })] });
    expect(computeFightList(s, NOW)[0]?.type).toBe("STALLED_PROJECT"); // default 14
    expect(computeFightList(s, NOW, custom)).toEqual([]);
  });

  it("decisionUrgentHours 24 flips a 22h-remaining decision to sev 3", () => {
    const s = snap({ pendingDecisions: [decision({ createdAt: subHours(NOW, 26) })] }); // 22h left
    expect(computeFightList(s, NOW)[0]?.severity).toBe(2); // default urgent = 12h
    expect(computeFightList(s, NOW, custom)[0]?.severity).toBe(3);
  });

  it("computeResultsUrgentDays 1 makes a 2-day-overdue result sev 3", () => {
    const s = snap({
      activeComputeRequests: [
        computeRequest({ status: "APPROVED", windowEnd: subDays(NOW, 2) }),
      ],
    });
    expect(computeFightList(s, NOW)[0]?.severity).toBe(2); // default 7d
    expect(computeFightList(s, NOW, custom)[0]?.severity).toBe(3);
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

// ————————————————————————————————————— secretary tasks (v4)

const taylor = { id: "u-taylor", name: "Taylor" };

function task(over: Partial<import("./fight-engine").TaskRow> = {}) {
  return {
    id: "t1",
    title: "Order the cryostat o-rings",
    deadline: addDays(NOW, 3),
    createdAt: subDays(NOW, 1),
    status: "OPEN",
    assigneeId: taylor.id,
    assignee: taylor,
    requester: alice,
    projectId: null as string | null,
    ...over,
  };
}

describe("OVERDUE_TASK / UNOWNED_TASK", () => {
  it("healthy assigned task → no fights", () => {
    expect(computeFightList(snap({ openTasks: [task()] }), NOW)).toEqual([]);
  });

  it("overdue task yells at the assignee (severity 3)", () => {
    const items = computeFightList(
      snap({ openTasks: [task({ deadline: subDays(NOW, 2) })] }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "OVERDUE_TASK",
      severity: 3,
      ageDays: 2,
      projectId: null,
      responsible: taylor,
    });
  });

  it("overdue unassigned task yells at the requester; overdue beats unowned", () => {
    const items = computeFightList(
      snap({
        openTasks: [
          task({ deadline: subDays(NOW, 1), assigneeId: null, assignee: null, createdAt: subDays(NOW, 10) }),
        ],
      }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "OVERDUE_TASK", responsible: alice });
  });

  it("unowned task escalates only past the grace period (severity 2)", () => {
    const fresh = snap({
      openTasks: [task({ assigneeId: null, assignee: null, createdAt: subDays(NOW, 1) })],
    });
    expect(computeFightList(fresh, NOW)).toEqual([]);

    const stale = snap({
      openTasks: [task({ assigneeId: null, assignee: null, createdAt: subDays(NOW, 4) })],
    });
    const items = computeFightList(stale, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "UNOWNED_TASK",
      severity: 2,
      ageDays: 2,
      responsible: alice,
    });
  });

  it("a frozen linked project freezes the task fight", () => {
    for (const state of ["PAUSED", "DONE", "KILLED"]) {
      const items = computeFightList(
        snap({
          projects: [project({ state })],
          openTasks: [task({ projectId: "p1", deadline: subDays(NOW, 5) })],
        }),
        NOW
      );
      expect(items.filter((i) => i.type === "OVERDUE_TASK")).toEqual([]);
    }
  });

  it("a HIDDEN linked project never hides the task from its assignee", () => {
    // Task links to a project missing from the (visibility-scoped) snapshot.
    const items = computeFightList(
      snap({ projects: [], openTasks: [task({ projectId: "p-hidden", deadline: subDays(NOW, 5) })] }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "OVERDUE_TASK",
      projectId: null,
      projectTitle: null,
    });
  });

  it("linked moving project carries its title onto the fight", () => {
    const items = computeFightList(
      snap({ projects: [project()], openTasks: [task({ projectId: "p1", deadline: subDays(NOW, 1) })] }),
      NOW
    );
    expect(items[0]).toMatchObject({ projectId: "p1", projectTitle: "Test project" });
  });

  it("task rules honor enabledRules toggles", () => {
    const snapshot = snap({
      openTasks: [
        task({ deadline: subDays(NOW, 2) }),
        task({ id: "t2", assigneeId: null, assignee: null, createdAt: subDays(NOW, 10) }),
      ],
    });
    const items = computeFightList(snapshot, NOW, undefined, {
      enabledRules: { OVERDUE_TASK: false, UNOWNED_TASK: false },
    });
    expect(items).toEqual([]);
  });
});

// ————————————————————————————————————— initiatives (v5)

function initiative(over: Partial<import("./fight-engine").InitiativeRow> = {}) {
  return {
    id: "i1",
    title: "Dedicated GPU budget line for 2027",
    deadline: addDays(NOW, 14),
    createdAt: subDays(NOW, 1),
    status: "OPEN",
    assigneeId: prof.id,
    assignee: prof,
    requester: prof,
    ...over,
  };
}

describe("OVERDUE_INITIATIVE / UNOWNED_INITIATIVE", () => {
  it("healthy assigned initiative → no fights", () => {
    expect(computeFightList(snap({ openInitiatives: [initiative()] }), NOW)).toEqual([]);
  });

  it("overdue initiative yells at the assignee, severity 3, no project link", () => {
    const items = computeFightList(
      snap({ openInitiatives: [initiative({ deadline: subDays(NOW, 4) })] }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "OVERDUE_INITIATIVE",
      severity: 3,
      ageDays: 4,
      projectId: null,
      projectTitle: null,
      responsible: prof,
    });
  });

  it("overdue unowned falls back to the requester; overdue beats unowned", () => {
    const items = computeFightList(
      snap({
        openInitiatives: [
          initiative({
            deadline: subDays(NOW, 2),
            assigneeId: null,
            assignee: null,
            requester: alice,
            createdAt: subDays(NOW, 20),
          }),
        ],
      }),
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "OVERDUE_INITIATIVE", responsible: alice });
  });

  it("unowned escalates only past the grace period, severity 2", () => {
    const fresh = snap({
      openInitiatives: [initiative({ assigneeId: null, assignee: null, createdAt: subDays(NOW, 1) })],
    });
    expect(computeFightList(fresh, NOW)).toEqual([]);

    const stale = snap({
      openInitiatives: [
        initiative({ assigneeId: null, assignee: null, requester: prof, createdAt: subDays(NOW, 5) }),
      ],
    });
    const items = computeFightList(stale, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "UNOWNED_INITIATIVE",
      severity: 2,
      ageDays: 3,
      responsible: prof,
    });
  });

  it("initiative rules honor enabledRules toggles", () => {
    const snapshot = snap({
      openInitiatives: [
        initiative({ deadline: subDays(NOW, 3) }),
        initiative({ id: "i2", assigneeId: null, assignee: null, createdAt: subDays(NOW, 10) }),
      ],
    });
    expect(
      computeFightList(snapshot, NOW, undefined, {
        enabledRules: { OVERDUE_INITIATIVE: false, UNOWNED_INITIATIVE: false },
      })
    ).toEqual([]);
  });

  it("closed initiatives never fight", () => {
    for (const status of ["WON", "LOST", "CANCELLED"]) {
      expect(
        computeFightList(
          snap({ openInitiatives: [initiative({ status, deadline: subDays(NOW, 30) })] }),
          NOW
        )
      ).toEqual([]);
    }
  });
});
