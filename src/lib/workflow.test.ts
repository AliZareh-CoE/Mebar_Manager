import { describe, expect, it } from "vitest";
import {
  applyEvent,
  availableTransitions,
  transitionDescriptors,
  initialStateKey,
  frozenStateKeys,
  stallStateKeys,
  activationStateKeys,
  resolveStateDisplay,
  workflowSchema,
  workflowWarnings,
  type Workflow,
  type WorkflowEvent,
} from "./workflow";
import { DEFAULT_WORKFLOW } from "./settings-defaults";

const NOW = new Date("2026-07-14T12:00:00Z");
const FUTURE = new Date("2026-07-21T12:00:00Z");
const PAST = new Date("2026-07-01T12:00:00Z");

const pause = (over: Partial<WorkflowEvent> = {}): WorkflowEvent => ({
  type: "PAUSE",
  pauseReason: "Waiting for the new laser head",
  reviveDate: FUTURE,
  now: NOW,
  ...over,
});

const NON_TERMINAL = ["PROPOSAL", "SCOPING", "ACTIVE", "BLOCKED", "PAUSED"] as const;

describe("legal transitions (default workflow parity)", () => {
  const legal: Array<[string, WorkflowEvent, string]> = [
    ["PROPOSAL", { type: "APPROVE" }, "SCOPING"],
    ["SCOPING", { type: "START" }, "ACTIVE"],
    ["ACTIVE", { type: "BLOCK" }, "BLOCKED"],
    ["BLOCKED", { type: "UNBLOCK" }, "ACTIVE"],
    ["ACTIVE", pause(), "PAUSED"],
    ["BLOCKED", pause(), "PAUSED"],
    ["PAUSED", { type: "REVIVE" }, "ACTIVE"],
    ["ACTIVE", { type: "COMPLETE" }, "DONE"],
    ["PROPOSAL", { type: "KILL" }, "KILLED"],
    ["SCOPING", { type: "KILL" }, "KILLED"],
    ["ACTIVE", { type: "KILL" }, "KILLED"],
    ["BLOCKED", { type: "KILL" }, "KILLED"],
    ["PAUSED", { type: "KILL" }, "KILLED"],
  ];

  it.each(legal)("%s + %o → %s", (from, event, to) => {
    const result = applyEvent(DEFAULT_WORKFLOW, from, event, "MANAGER");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next).toBe(to);
  });
});

describe("illegal transitions", () => {
  it("DONE and KILLED are terminal", () => {
    for (const state of ["DONE", "KILLED"]) {
      for (const type of ["APPROVE", "START", "BLOCK", "UNBLOCK", "REVIVE", "COMPLETE", "KILL"]) {
        expect(applyEvent(DEFAULT_WORKFLOW, state, { type }, "MANAGER").ok).toBe(false);
      }
      expect(applyEvent(DEFAULT_WORKFLOW, state, pause(), "MANAGER").ok).toBe(false);
      expect(availableTransitions(DEFAULT_WORKFLOW, state, "MANAGER")).toEqual([]);
    }
  });

  it("cannot skip states", () => {
    expect(applyEvent(DEFAULT_WORKFLOW, "PROPOSAL", { type: "START" }, "MANAGER").ok).toBe(false);
    expect(applyEvent(DEFAULT_WORKFLOW, "PROPOSAL", { type: "COMPLETE" }, "MANAGER").ok).toBe(false);
    expect(applyEvent(DEFAULT_WORKFLOW, "SCOPING", { type: "BLOCK" }, "MANAGER").ok).toBe(false);
    expect(applyEvent(DEFAULT_WORKFLOW, "BLOCKED", { type: "COMPLETE" }, "MANAGER").ok).toBe(false);
    expect(applyEvent(DEFAULT_WORKFLOW, "PAUSED", { type: "UNBLOCK" }, "MANAGER").ok).toBe(false);
  });
});

describe("pause guard", () => {
  it("requires a non-empty reason", () => {
    const result = applyEvent(DEFAULT_WORKFLOW, "ACTIVE", pause({ pauseReason: "   " }), "ENGINEER");
    expect(result).toEqual({ ok: false, error: "Pausing requires a reason." });
  });

  it("requires a revive date", () => {
    const result = applyEvent(DEFAULT_WORKFLOW, "ACTIVE", pause({ reviveDate: undefined }), "ENGINEER");
    expect(result).toEqual({ ok: false, error: "Pausing requires a revive date." });
  });

  it("rejects a revive date in the past", () => {
    const result = applyEvent(DEFAULT_WORKFLOW, "ACTIVE", pause({ reviveDate: PAST }), "ENGINEER");
    expect(result).toEqual({ ok: false, error: "The revive date can't be in the past." });
  });

  it("accepts today's date even when parsed as UTC midnight (date-input tz quirk)", () => {
    // <input type=date> yields "2026-07-14" → 2026-07-14T00:00Z, which is
    // *before* NOW's instant but the same UTC day — must be accepted.
    const sameDay = new Date("2026-07-14T00:00:00Z");
    const result = applyEvent(DEFAULT_WORKFLOW, "ACTIVE", pause({ reviveDate: sameDay }), "ENGINEER");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next).toBe("PAUSED");
  });
});

describe("gating", () => {
  it("engineers cannot approve or kill (role shorthand)", () => {
    expect(applyEvent(DEFAULT_WORKFLOW, "PROPOSAL", { type: "APPROVE" }, "ENGINEER").ok).toBe(false);
    expect(applyEvent(DEFAULT_WORKFLOW, "ACTIVE", { type: "KILL" }, "ENGINEER").ok).toBe(false);
  });

  it("engineers can run the day-to-day transitions", () => {
    expect(applyEvent(DEFAULT_WORKFLOW, "SCOPING", { type: "START" }, "ENGINEER").ok).toBe(true);
    expect(applyEvent(DEFAULT_WORKFLOW, "ACTIVE", { type: "BLOCK" }, "ENGINEER").ok).toBe(true);
    expect(applyEvent(DEFAULT_WORKFLOW, "ACTIVE", pause(), "ENGINEER").ok).toBe(true);
    expect(applyEvent(DEFAULT_WORKFLOW, "ACTIVE", { type: "COMPLETE" }, "ENGINEER").ok).toBe(true);
  });

  it("availableTransitions hides gated transitions from engineers", () => {
    expect(availableTransitions(DEFAULT_WORKFLOW, "PROPOSAL", "ENGINEER")).toEqual([]);
    expect(
      availableTransitions(DEFAULT_WORKFLOW, "PROPOSAL", "MANAGER").map((t) => t.key)
    ).toEqual(["APPROVE", "KILL"]);
    expect(
      availableTransitions(DEFAULT_WORKFLOW, "ACTIVE", "ENGINEER").map((t) => t.key)
    ).toEqual(["BLOCK", "PAUSE", "COMPLETE"]);
  });

  it("accepts a predicate gate keyed on the transition's gate field", () => {
    const canApproveOnly = applyEvent(
      DEFAULT_WORKFLOW,
      "PROPOSAL",
      { type: "APPROVE" },
      (t) => t.gate === "project.approve"
    );
    expect(canApproveOnly.ok).toBe(true);
    const killDenied = applyEvent(
      DEFAULT_WORKFLOW,
      "PROPOSAL",
      { type: "KILL" },
      (t) => t.gate === "project.approve"
    );
    expect(killDenied.ok).toBe(false);
  });
});

describe("every non-terminal state has a way forward", () => {
  it.each(NON_TERMINAL)("%s has manager transitions", (state) => {
    expect(availableTransitions(DEFAULT_WORKFLOW, state, "MANAGER").length).toBeGreaterThan(0);
  });

  it("the default workflow has no editor warnings", () => {
    expect(workflowWarnings(DEFAULT_WORKFLOW)).toEqual([]);
  });
});

// ————————————————————————————————————— custom (admin-authored) workflows

const CUSTOM: Workflow = workflowSchema.parse({
  states: [
    { key: "TRIAGE", label: "Triage", color: "violet", flags: { initial: true } },
    {
      key: "RUNNING",
      label: "Running",
      color: "green",
      flags: { countsForStall: true, resetsStallClock: true },
    },
    { key: "ON_ICE", label: "On ice", color: "cyan", flags: { paused: true } },
    { key: "RETIRED", label: "Retired", color: "muted", archived: true },
    { key: "SHIPPED", label: "Shipped", color: "emerald", flags: { terminal: true } },
  ],
  transitions: [
    { key: "GO", from: "TRIAGE", to: "RUNNING", label: "Green-light", gate: "manager" },
    { key: "FREEZE", from: "RUNNING", to: "ON_ICE", label: "Put on ice" },
    { key: "THAW", from: "ON_ICE", to: "RUNNING", label: "Thaw" },
    { key: "SHIP", from: "RUNNING", to: "SHIPPED", label: "Ship it", requiresReason: true },
    { key: "RETIRE", from: "RUNNING", to: "RETIRED", label: "Retire" },
  ],
});

describe("custom workflows", () => {
  it("applies admin-defined transitions", () => {
    const result = applyEvent(CUSTOM, "TRIAGE", { type: "GO" }, "MANAGER");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.next).toBe("RUNNING");
  });

  it("honors the manager gate on custom transitions", () => {
    expect(applyEvent(CUSTOM, "TRIAGE", { type: "GO" }, "ENGINEER").ok).toBe(false);
  });

  it("custom paused-flagged states demand pause fields", () => {
    expect(applyEvent(CUSTOM, "RUNNING", { type: "FREEZE" }, "ENGINEER").ok).toBe(false);
    const withFields = applyEvent(
      CUSTOM,
      "RUNNING",
      { type: "FREEZE", pauseReason: "vendor delay", reviveDate: FUTURE, now: NOW },
      "ENGINEER"
    );
    expect(withFields.ok).toBe(true);
  });

  it("refuses transitions into archived states and hides them from buttons", () => {
    const result = applyEvent(CUSTOM, "RUNNING", { type: "RETIRE" }, "MANAGER");
    expect(result.ok).toBe(false);
    expect(
      availableTransitions(CUSTOM, "RUNNING", "MANAGER").map((t) => t.key)
    ).toEqual(["FREEZE", "SHIP"]);
  });

  it("selectors derive semantics from flags", () => {
    expect(initialStateKey(CUSTOM)).toBe("TRIAGE");
    expect(frozenStateKeys(CUSTOM).sort()).toEqual(["ON_ICE", "SHIPPED"]);
    expect(stallStateKeys(CUSTOM)).toEqual(["RUNNING"]);
    expect(activationStateKeys(CUSTOM)).toEqual(["RUNNING"]);
  });

  it("descriptors carry dialog hints", () => {
    const desc = transitionDescriptors(CUSTOM, "RUNNING", "MANAGER");
    expect(desc.find((d) => d.key === "FREEZE")?.needsPauseFields).toBe(true);
    expect(desc.find((d) => d.key === "SHIP")?.requiresReason).toBe(true);
  });

  it("resolveStateDisplay falls back to a muted raw key for unknown states", () => {
    expect(resolveStateDisplay(CUSTOM, "ON_ICE")).toEqual({ label: "On ice", color: "cyan" });
    expect(resolveStateDisplay(CUSTOM, "GHOST")).toEqual({ label: "GHOST", color: "muted" });
  });

  it("warns about dead-end states without failing validation", () => {
    const deadEnd = workflowSchema.parse({
      states: [
        { key: "A", label: "A", flags: { initial: true } },
        { key: "B", label: "B" },
      ],
      transitions: [{ key: "GO", from: "A", to: "B", label: "Go" }],
    });
    expect(workflowWarnings(deadEnd)).toHaveLength(1);
    expect(workflowWarnings(deadEnd)[0]).toContain('"B" has no way out');
  });
});

describe("workflow schema invariants", () => {
  const base = {
    states: [
      { key: "A", label: "A", flags: { initial: true } },
      { key: "B", label: "B", flags: { terminal: true } },
    ],
    transitions: [{ key: "GO", from: "A", to: "B", label: "Go" }],
  };

  it("accepts a minimal valid workflow", () => {
    expect(workflowSchema.safeParse(base).success).toBe(true);
  });

  it("rejects duplicate state keys", () => {
    const wf = { ...base, states: [...base.states, { key: "A", label: "A2" }] };
    expect(workflowSchema.safeParse(wf).success).toBe(false);
  });

  it("rejects zero or two initial states", () => {
    const none = { ...base, states: base.states.map((s) => ({ ...s, flags: {} })) };
    expect(workflowSchema.safeParse(none).success).toBe(false);
    const two = {
      ...base,
      states: [base.states[0], { key: "B", label: "B", flags: { initial: true } }],
      transitions: [],
    };
    expect(workflowSchema.safeParse(two).success).toBe(false);
  });

  it("rejects an archived initial state", () => {
    const wf = {
      ...base,
      states: [{ key: "A", label: "A", archived: true, flags: { initial: true } }],
      transitions: [],
    };
    expect(workflowSchema.safeParse(wf).success).toBe(false);
  });

  it("rejects transitions out of terminal states", () => {
    const wf = {
      ...base,
      transitions: [...base.transitions, { key: "BACK", from: "B", to: "A", label: "Back" }],
    };
    expect(workflowSchema.safeParse(wf).success).toBe(false);
  });

  it("rejects transitions referencing missing states", () => {
    const wf = {
      ...base,
      transitions: [{ key: "GO", from: "A", to: "NOWHERE", label: "Go" }],
    };
    expect(workflowSchema.safeParse(wf).success).toBe(false);
  });

  it("rejects duplicate (from, event) pairs", () => {
    const wf = {
      ...base,
      transitions: [
        { key: "GO", from: "A", to: "B", label: "Go" },
        { key: "GO", from: "A", to: "B", label: "Go again" },
      ],
    };
    expect(workflowSchema.safeParse(wf).success).toBe(false);
  });

  it("rejects malformed keys", () => {
    const wf = {
      ...base,
      states: [...base.states, { key: "lower case", label: "Bad" }],
    };
    expect(workflowSchema.safeParse(wf).success).toBe(false);
  });
});
