import { describe, expect, it } from "vitest";
import { labSettingsSchema } from "./settings-schema";
import { DEFAULT_WORKFLOW } from "./settings-defaults";
import { DEFAULT_THRESHOLDS } from "./fight-engine";
import { DEFAULT_MATRIX } from "./policy";

describe("labSettingsSchema defaults", () => {
  it("an empty blob reproduces stock behavior exactly", () => {
    const settings = labSettingsSchema.parse({});
    expect(settings.labName).toBe("Mebar");
    expect(settings.defaultTheme).toBe("dark");
    expect(settings.visibilityMode).toBe("RESTRICTED");
    expect(settings.workflow).toEqual(DEFAULT_WORKFLOW);
    expect(settings.permissions).toEqual(DEFAULT_MATRIX);
    // thresholds carries the fight-engine defaults plus the two age-pill numbers
    for (const [key, value] of Object.entries(DEFAULT_THRESHOLDS)) {
      expect(settings.thresholds[key as keyof typeof settings.thresholds]).toBe(value);
    }
  });

  it("default workflow instances are independent (no shared mutable state)", () => {
    const a = labSettingsSchema.parse({});
    const b = labSettingsSchema.parse({});
    a.workflow.states[0].label = "Mutated";
    expect(b.workflow.states[0].label).not.toBe("Mutated");
    expect(DEFAULT_WORKFLOW.states[0].label).not.toBe("Mutated");
  });

  it("a corrupt workflow slice degrades ONLY the workflow, not the rest", () => {
    const settings = labSettingsSchema.parse({
      labName: "Custom Lab",
      visibilityMode: "OPEN",
      workflow: { states: "garbage" },
    });
    expect(settings.labName).toBe("Custom Lab");
    expect(settings.visibilityMode).toBe("OPEN");
    expect(settings.workflow).toEqual(DEFAULT_WORKFLOW);
  });

  it("an invalid workflow (violating invariants) also falls back to stock", () => {
    const twoInitials = structuredClone(DEFAULT_WORKFLOW);
    twoInitials.states[1].flags.initial = true;
    const settings = labSettingsSchema.parse({ workflow: twoInitials });
    expect(settings.workflow).toEqual(DEFAULT_WORKFLOW);
  });

  it("a valid custom workflow round-trips untouched", () => {
    const custom = structuredClone(DEFAULT_WORKFLOW);
    custom.states.push({
      key: "TRIAGE",
      label: "Triage",
      color: "violet",
      description: "",
      archived: false,
      flags: {
        initial: false,
        countsForStall: false,
        paused: false,
        terminal: false,
        resetsStallClock: false,
        hideFromBoard: false,
      },
    });
    const settings = labSettingsSchema.parse({ workflow: custom });
    expect(settings.workflow.states.map((s) => s.key)).toContain("TRIAGE");
  });
});

describe("fight rule config", () => {
  it("empty blob yields all rules enabled in stock order", async () => {
    const { FIGHT_TYPES } = await import("./fight-types");
    const settings = labSettingsSchema.parse({});
    expect(settings.fightSectionOrder).toEqual([...FIGHT_TYPES]);
    for (const t of FIGHT_TYPES) {
      expect(settings.fightRules[t].enabled).toBe(true);
      expect(settings.fightRules[t].title.length).toBeGreaterThan(0);
    }
  });

  it("saved orders/rules from before a new rule shipped self-heal", () => {
    const settings = labSettingsSchema.parse({
      // Pretend this was saved before OVERDUE_TASK/UNOWNED_TASK existed.
      fightSectionOrder: ["MISSED_MILESTONE", "STALLED_PROJECT"],
      fightRules: {
        STALLED_PROJECT: { enabled: false, title: "Zombies", blurb: "" },
      },
    });
    // Explicit order kept first, missing types appended.
    expect(settings.fightSectionOrder.slice(0, 2)).toEqual([
      "MISSED_MILESTONE",
      "STALLED_PROJECT",
    ]);
    expect(settings.fightSectionOrder).toContain("OVERDUE_TASK");
    expect(settings.fightSectionOrder).toContain("UNOWNED_TASK");
    // Customized rule kept; missing rules defaulted.
    expect(settings.fightRules.STALLED_PROJECT).toMatchObject({
      enabled: false,
      title: "Zombies",
    });
    expect(settings.fightRules.OVERDUE_TASK.enabled).toBe(true);
  });

  it("stock rule copy passes its own save validation (title ≤60, blurb ≤200)", async () => {
    // A default blurb longer than the schema max silently breaks EVERY
    // "Save fight rules" submit — the whole form fails validation.
    const { fightRuleSchema } = await import("./settings-schema");
    const { DEFAULT_FIGHT_SECTIONS } = await import("./settings-defaults");
    for (const [type, rule] of Object.entries(DEFAULT_FIGHT_SECTIONS)) {
      expect(() => fightRuleSchema.parse(rule), type).not.toThrow();
    }
  });

  it("handbook slice: defaults, passthrough, empty allowed, corrupt degrades", async () => {
    const { DEFAULT_HANDBOOK } = await import("./settings-defaults");
    const { handbookSectionSchema } = await import("./settings-schema");
    // Default when absent.
    expect(labSettingsSchema.parse({}).handbook).toEqual(DEFAULT_HANDBOOK);
    // Valid passthrough.
    expect(
      labSettingsSchema.parse({ handbook: [{ title: "X", body: "y" }] }).handbook
    ).toEqual([{ title: "X", body: "y" }]);
    // Empty is allowed — a lab may clear it (default only fires on undefined).
    expect(labSettingsSchema.parse({ handbook: [] }).handbook).toEqual([]);
    // Corrupt degrades to stock without breaking the whole parse.
    const corrupt = labSettingsSchema.parse({ handbook: "not an array" });
    expect(corrupt.handbook).toEqual(DEFAULT_HANDBOOK);
    // Title required; length caps enforced.
    expect(handbookSectionSchema.safeParse({ title: "", body: "x" }).success).toBe(false);
    expect(
      handbookSectionSchema.safeParse({ title: "t".repeat(81), body: "x" }).success
    ).toBe(false);
    expect(
      handbookSectionSchema.safeParse({ title: "t", body: "b".repeat(4001) }).success
    ).toBe(false);
  });

  it("tagline defaults and trims", () => {
    expect(labSettingsSchema.parse({}).tagline).toBe(
      "A board that gets angry when things sit still."
    );
    expect(labSettingsSchema.parse({ tagline: "  Fight! " }).tagline).toBe("Fight!");
  });
});

describe("performance settings slice", () => {
  it("empty blob yields defaults for window, cap, and every weight", async () => {
    const { PERFORMANCE_METRICS, DEFAULT_PERFORMANCE_WEIGHTS } = await import(
      "./performance-metrics"
    );
    const settings = labSettingsSchema.parse({});
    expect(settings.performance.windowDays).toBe(90);
    expect(settings.performance.updatesCapPerProjectPerWeek).toBe(3);
    for (const m of PERFORMANCE_METRICS) {
      expect(settings.performance.weights[m]).toBe(DEFAULT_PERFORMANCE_WEIGHTS[m]);
    }
  });

  it("weights saved before a new metric shipped self-heal to its default", () => {
    const settings = labSettingsSchema.parse({
      performance: { windowDays: 30, weights: { milestoneDone: 7 } },
    });
    expect(settings.performance.windowDays).toBe(30);
    expect(settings.performance.weights.milestoneDone).toBe(7);
    // A metric absent from the saved blob picks up its stock weight.
    expect(settings.performance.weights.computeDecided).toBe(1);
  });

  it("a corrupt performance slice degrades only itself", () => {
    const settings = labSettingsSchema.parse({
      labName: "Kept",
      performance: { windowDays: "not a number at all", weights: 42 },
    });
    expect(settings.labName).toBe("Kept");
    expect(settings.performance.windowDays).toBe(90);
  });
});
