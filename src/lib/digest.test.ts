import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { labSettingsSchema } from "./settings-schema";
import { buildDigest, type DigestInput } from "./digest";
import type { FightItem } from "./fight-engine";

const settings = labSettingsSchema.parse({});
const NOW = new Date("2026-07-16T00:00:00Z");
const me = { id: "me", name: "Me", email: "me@lab.local" };
const other = { id: "other", name: "Other" };

function fight(over: Partial<FightItem> = {}): FightItem {
  return {
    type: "STALLED_PROJECT",
    severity: 3,
    ageDays: 7,
    projectId: "p1",
    projectTitle: "Cryo stage",
    entityId: "p1",
    headline: "No update in 21 days",
    responsible: { id: me.id, name: me.name },
    ...over,
  };
}

const empty: DigestInput = { fights: [], dueThisWeek: [], projects: [] };

describe("buildDigest", () => {
  it("empty week — all clear, no section headers, sign-off present", () => {
    const d = buildDigest(me, empty, settings, NOW);
    expect(d.subject).toBe(`[${settings.labName}] Your week — all clear`);
    expect(d.text).toContain("Hi Me,");
    expect(d.text).toContain("Keep the streak going.");
    expect(d.text).not.toContain("YOUR FIGHTS");
    expect(d.text).not.toContain("DUE THIS WEEK");
    expect(d.text).not.toContain("YOUR PROJECTS");
    expect(d.text).toContain("automated weekly digest");
  });

  it("busy week — filters to the person, live titles, formatted dates, age labels", () => {
    const due1 = new Date("2026-07-18T00:00:00Z");
    const due2 = new Date("2026-07-20T00:00:00Z");
    const d = buildDigest(
      me,
      {
        fights: [
          fight(),
          fight({ severity: 2, headline: "Someone else's problem", responsible: other }),
        ],
        dueThisWeek: [
          { kind: "task", title: "Order piezo driver", projectTitle: null, due: due2 },
          { kind: "milestone", title: "First closed-loop plot", projectTitle: "Cryo stage", due: due1 },
        ],
        projects: [
          { id: "p1", title: "Cryo stage", ageDays: 21 },
          { id: "p2", title: "Defect classifier", ageDays: 3 },
        ],
      },
      settings,
      NOW
    );
    expect(d.subject).toBe(`[${settings.labName}] Your week — 1 fight, 2 due`);
    expect(d.text).toContain(
      `[today] ${settings.fightRules.STALLED_PROJECT.title}: No update in 21 days`
    );
    expect(d.text).toContain("Project: Cryo stage");
    expect(d.text).not.toContain("Someone else's problem");
    expect(d.text).toContain("YOUR FIGHTS (1)");
    expect(d.text).toContain("DUE THIS WEEK (2)");
    expect(d.text).toContain("YOUR PROJECTS (2)");
    expect(d.text).toContain(`- ${format(due1, "EEE MMM d")} — Milestone: First closed-loop plot`);
    // Soonest first regardless of input order.
    expect(d.text.indexOf("First closed-loop plot")).toBeLessThan(
      d.text.indexOf("Order piezo driver")
    );
    expect(d.text).toContain("Cryo stage: 21d since progress (stale)");
    expect(d.text).toContain("Defect classifier: 3d since progress (fresh)");
  });

  it("never leaks the pointing system", () => {
    const d = buildDigest(
      me,
      {
        fights: [fight()],
        dueThisWeek: [
          { kind: "paperTarget", title: "Draft", projectTitle: "Cryo stage", due: NOW },
        ],
        projects: [{ id: "p1", title: "Cryo stage", ageDays: 0 }],
      },
      settings,
      NOW
    );
    expect(d.text.toLowerCase()).not.toMatch(/\bpoints?\b|\bscore|\bweights?\b|\bstandings\b/);
    expect(d.text).toContain("Cryo stage: moved today (fresh)");
  });

  it("project-only person still gets the projects block (skipping is the sender's job)", () => {
    const d = buildDigest(
      me,
      { ...empty, projects: [{ id: "p1", title: "Cryo stage", ageDays: 10 }] },
      settings,
      NOW
    );
    expect(d.subject).toContain("all clear");
    expect(d.text).toContain("YOUR PROJECTS (1)");
    expect(d.text).toContain("Cryo stage: 10d since progress (aging)");
  });
});
