import { describe, it, expect } from "vitest";
import { FIGHT_TYPES } from "./fight-types";
import { thresholdSettingsSchema, performanceSettingsSchema } from "./settings-schema";
import {
  FIGHT_TYPE_HELP,
  MECHANISM_HELP,
  fightTypeHelpCopy,
  type HelpContext,
} from "./help-copy";

function ctx(over: Partial<HelpContext["thresholds"]> = {}, perf: Record<string, number> = {}): HelpContext {
  return {
    thresholds: thresholdSettingsSchema.parse(over),
    performance: performanceSettingsSchema.parse(
      Object.keys(perf).length ? { weights: perf } : {}
    ),
  };
}

describe("help copy", () => {
  it("every fight rule has non-empty what/who/clear/advice", () => {
    const c = ctx();
    for (const type of FIGHT_TYPES) {
      const h = FIGHT_TYPE_HELP[type](c);
      for (const field of ["what", "who", "clear", "advice"] as const) {
        expect(h[field].length, `${type}.${field}`).toBeGreaterThan(0);
      }
    }
  });

  it("interpolates LIVE thresholds, not hardcoded defaults", () => {
    const c = ctx({ stallDays: 42, decisionTimeoutHours: 99, minActiveProjects: 13 });
    expect(FIGHT_TYPE_HELP.STALLED_PROJECT(c).what).toContain("42");
    expect(FIGHT_TYPE_HELP.PENDING_DECISION(c).what).toContain("99");
    expect(FIGHT_TYPE_HELP.UNDERLOADED_RESEARCHER(c).what).toContain("13");
    expect(MECHANISM_HELP.autoProceed(c).body.toString()).toContain("99");
    expect(MECHANISM_HELP.agePill(c).body.toString()).toContain("42");
  });

  it("interpolates LIVE weights", () => {
    const c = ctx({}, { paperAccepted: 77, paperSubmitted: 33 });
    expect(MECHANISM_HELP.papers(c).body.toString()).toContain("77");
    expect(MECHANISM_HELP.papers(c).body.toString()).toContain("33");
    expect(FIGHT_TYPE_HELP.PAPERLESS_PROJECT(c).advice).toContain("33");
  });

  it("no copy contains undefined or NaN under defaults", () => {
    const c = ctx();
    const all: string[] = [];
    for (const type of FIGHT_TYPES) {
      const h = FIGHT_TYPE_HELP[type](c);
      all.push(h.what, h.who, h.clear, h.advice);
    }
    for (const build of Object.values(MECHANISM_HELP)) {
      const { title, body } = build(c);
      all.push(title, ...(Array.isArray(body) ? body : [body]));
    }
    for (const s of all) {
      expect(s).not.toMatch(/undefined|NaN/);
    }
  });

  it("fightTypeHelpCopy folds all four parts into the hint body", () => {
    const copy = fightTypeHelpCopy("UNDERLOADED_RESEARCHER", ctx());
    expect(copy.body).toHaveLength(4);
    expect(copy.body[3]).toMatch(/^Win: /);
  });
});
