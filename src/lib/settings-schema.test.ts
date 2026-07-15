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

  it("tagline defaults and trims", () => {
    expect(labSettingsSchema.parse({}).tagline).toBe(
      "A board that gets angry when things sit still."
    );
    expect(labSettingsSchema.parse({ tagline: "  Fight! " }).tagline).toBe("Fight!");
  });
});
