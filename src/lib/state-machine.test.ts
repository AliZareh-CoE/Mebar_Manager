import { describe, expect, it } from "vitest";
import { applyEvent, availableEvents, type ProjectEvent } from "./state-machine";
import { PROJECT_STATES, type ProjectState } from "@/lib/db/schema";

const NOW = new Date("2026-07-14T12:00:00Z");
const FUTURE = new Date("2026-07-21T12:00:00Z");
const PAST = new Date("2026-07-01T12:00:00Z");

const pause = (over: Partial<Extract<ProjectEvent, { type: "PAUSE" }>> = {}): ProjectEvent => ({
  type: "PAUSE",
  pauseReason: "Waiting for the new laser head",
  reviveDate: FUTURE,
  now: NOW,
  ...over,
});

describe("legal transitions", () => {
  const legal: Array<[ProjectState, ProjectEvent, ProjectState]> = [
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
    const result = applyEvent(from, event, "MANAGER");
    expect(result).toEqual({ ok: true, next: to });
  });
});

describe("illegal transitions", () => {
  it("DONE and KILLED are terminal", () => {
    for (const state of ["DONE", "KILLED"] as const) {
      for (const type of ["APPROVE", "START", "BLOCK", "UNBLOCK", "REVIVE", "COMPLETE", "KILL"] as const) {
        expect(applyEvent(state, { type }, "MANAGER").ok).toBe(false);
      }
      expect(applyEvent(state, pause(), "MANAGER").ok).toBe(false);
      expect(availableEvents(state, "MANAGER")).toEqual([]);
    }
  });

  it("cannot skip states", () => {
    expect(applyEvent("PROPOSAL", { type: "START" }, "MANAGER").ok).toBe(false);
    expect(applyEvent("PROPOSAL", { type: "COMPLETE" }, "MANAGER").ok).toBe(false);
    expect(applyEvent("SCOPING", { type: "BLOCK" }, "MANAGER").ok).toBe(false);
    expect(applyEvent("BLOCKED", { type: "COMPLETE" }, "MANAGER").ok).toBe(false);
    expect(applyEvent("PAUSED", { type: "UNBLOCK" }, "MANAGER").ok).toBe(false);
  });
});

describe("pause guard", () => {
  it("requires a non-empty reason", () => {
    const result = applyEvent("ACTIVE", pause({ pauseReason: "   " }), "ENGINEER");
    expect(result).toEqual({ ok: false, error: "Pausing requires a reason." });
  });

  it("requires a future revive date", () => {
    const result = applyEvent("ACTIVE", pause({ reviveDate: PAST }), "ENGINEER");
    expect(result).toEqual({ ok: false, error: "Pausing requires a future revive date." });
  });
});

describe("role gating", () => {
  it("engineers cannot approve or kill", () => {
    expect(applyEvent("PROPOSAL", { type: "APPROVE" }, "ENGINEER").ok).toBe(false);
    expect(applyEvent("ACTIVE", { type: "KILL" }, "ENGINEER").ok).toBe(false);
  });

  it("engineers can run the day-to-day transitions", () => {
    expect(applyEvent("SCOPING", { type: "START" }, "ENGINEER").ok).toBe(true);
    expect(applyEvent("ACTIVE", { type: "BLOCK" }, "ENGINEER").ok).toBe(true);
    expect(applyEvent("ACTIVE", pause(), "ENGINEER").ok).toBe(true);
    expect(applyEvent("ACTIVE", { type: "COMPLETE" }, "ENGINEER").ok).toBe(true);
  });

  it("availableEvents hides manager-only events from engineers", () => {
    expect(availableEvents("PROPOSAL", "ENGINEER")).toEqual([]);
    expect(availableEvents("PROPOSAL", "MANAGER")).toEqual(["APPROVE", "KILL"]);
    expect(availableEvents("ACTIVE", "ENGINEER")).toEqual(["BLOCK", "PAUSE", "COMPLETE"]);
  });
});

describe("every non-terminal state has a way forward", () => {
  it.each(PROJECT_STATES.filter((s) => s !== "DONE" && s !== "KILLED"))(
    "%s has manager events",
    (state) => {
      expect(availableEvents(state, "MANAGER").length).toBeGreaterThan(0);
    }
  );
});
