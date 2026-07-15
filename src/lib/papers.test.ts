import { describe, it, expect } from "vitest";
import { PAPER_STATUSES, type PaperStatus } from "@/lib/db/schema";
import {
  canTransitionPaper,
  transitionRequirements,
  transitionColumns,
  PAPER_TRANSITIONS,
} from "./papers";

const NOW = new Date("2026-07-14T12:00:00Z");

describe("paper lifecycle", () => {
  it("follows the map: draft→submit→decide, rejections/withdrawals resubmit", () => {
    expect(canTransitionPaper("DRAFTING", "SUBMITTED")).toBe(true);
    expect(canTransitionPaper("SUBMITTED", "ACCEPTED")).toBe(true);
    expect(canTransitionPaper("SUBMITTED", "REJECTED")).toBe(true);
    expect(canTransitionPaper("SUBMITTED", "WITHDRAWN")).toBe(true);
    expect(canTransitionPaper("REJECTED", "SUBMITTED")).toBe(true);
    expect(canTransitionPaper("WITHDRAWN", "SUBMITTED")).toBe(true);
  });

  it("forbids skipping and reversing", () => {
    expect(canTransitionPaper("DRAFTING", "ACCEPTED")).toBe(false);
    expect(canTransitionPaper("DRAFTING", "REJECTED")).toBe(false);
    expect(canTransitionPaper("SUBMITTED", "DRAFTING")).toBe(false);
    expect(canTransitionPaper("REJECTED", "ACCEPTED")).toBe(false);
  });

  it("ACCEPTED is terminal", () => {
    for (const to of PAPER_STATUSES) {
      expect(canTransitionPaper("ACCEPTED", to as PaperStatus)).toBe(false);
    }
  });

  it("every status appears in the transition map", () => {
    expect(Object.keys(PAPER_TRANSITIONS).sort()).toEqual([...PAPER_STATUSES].sort());
  });

  it("submitting requires a venue; closing requires a reason", () => {
    expect(transitionRequirements("SUBMITTED")).toEqual({
      needsVenue: true,
      needsClosureNote: false,
    });
    expect(transitionRequirements("REJECTED").needsClosureNote).toBe(true);
    expect(transitionRequirements("WITHDRAWN").needsClosureNote).toBe(true);
    expect(transitionRequirements("ACCEPTED")).toEqual({
      needsVenue: false,
      needsClosureNote: false,
    });
  });

  it("submitting stamps submittedAt and clears the closure pair (resubmit)", () => {
    const cols = transitionColumns("SUBMITTED", NOW, { venue: "Nature Photonics" });
    expect(cols).toEqual({
      status: "SUBMITTED",
      submittedAt: NOW,
      closedAt: null,
      closureNote: null,
      venue: "Nature Photonics",
    });
  });

  it("accepting stamps acceptedAt and keeps submittedAt intact", () => {
    const cols = transitionColumns("ACCEPTED", NOW, {});
    expect(cols).toEqual({ status: "ACCEPTED", acceptedAt: NOW });
  });

  it("rejecting records the reason and closure time", () => {
    const cols = transitionColumns("REJECTED", NOW, { closureNote: "Reviewer 2." });
    expect(cols).toEqual({ status: "REJECTED", closedAt: NOW, closureNote: "Reviewer 2." });
  });
});
