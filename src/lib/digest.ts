import { format } from "date-fns";
import type { FightItem } from "@/lib/fight-engine";
import type { LabSettings } from "@/lib/settings-schema";

/**
 * The weekly digest builder. Pure — no DB, no clock; the sender assembles
 * the inputs and passes `now`. The text is score-free by construction (the
 * pointing system is leadership-only), so one digest format is safe for
 * every role.
 */

/** Recipient identity — id drives fight filtering, name the greeting. */
export interface DigestPerson {
  id: string;
  name: string;
  email: string;
}

/** A forward-looking item due in the coming week (NOT yet overdue — overdue
 * ones already surface as fights). Pre-scoped to the person by the sender. */
export interface DigestDueItem {
  kind: "milestone" | "task" | "dataRequest" | "paperTarget";
  title: string;
  /** Owning project, or null for standalone tasks / external requests. */
  projectTitle: string | null;
  due: Date;
}

/** One of the person's live projects, for the age-pill list. */
export interface DigestProject {
  id: string;
  title: string;
  /** From projectAgeDays(p, now) — days since last sign of progress. */
  ageDays: number;
}

/** `fights` is the FULL computed list — the builder filters it to
 * responsible.id === person.id. Due items and projects arrive pre-scoped. */
export interface DigestInput {
  fights: FightItem[];
  dueThisWeek: DigestDueItem[];
  projects: DigestProject[];
}

export interface Digest {
  subject: string;
  text: string;
}

const URGENCY: Record<1 | 2 | 3, string> = { 3: "today", 2: "this week", 1: "heads up" };
const KIND_LABEL: Record<DigestDueItem["kind"], string> = {
  milestone: "Milestone",
  task: "Task",
  dataRequest: "Data request",
  paperTarget: "Paper target",
};

export function buildDigest(
  person: DigestPerson,
  input: DigestInput,
  settings: LabSettings,
  now: Date
): Digest {
  void now; // reserved for future relative phrasing; keeps the signature stable
  const fights = input.fights.filter((f) => f.responsible?.id === person.id);
  const due = [...input.dueThisWeek].sort((a, b) => a.due.getTime() - b.due.getTime());
  const projects = input.projects;
  const allClear = fights.length === 0 && due.length === 0;

  const t = settings.thresholds;
  const ageLabel = (d: number) =>
    d <= t.ageFreshDays ? "fresh" : d <= t.ageAgingDays ? "aging" : "stale";

  const subject = allClear
    ? `[${settings.labName}] Your week — all clear`
    : `[${settings.labName}] Your week — ${fights.length} ${fights.length === 1 ? "fight" : "fights"}, ${due.length} due`;

  const fightLines = fights.flatMap((f) => {
    const head = `- [${URGENCY[f.severity]}] ${settings.fightRules[f.type].title}: ${f.headline}`;
    return f.projectTitle ? [head, `    Project: ${f.projectTitle}`] : [head];
  });
  const dueLines = due.flatMap((i) => {
    const head = `- ${format(i.due, "EEE MMM d")} — ${KIND_LABEL[i.kind]}: ${i.title}`;
    return i.projectTitle ? [head, `    Project: ${i.projectTitle}`] : [head];
  });
  const projectLines = projects.map(
    (p) =>
      `- ${p.title}: ${p.ageDays === 0 ? "moved today" : `${p.ageDays}d since progress`} (${ageLabel(p.ageDays)})`
  );

  const opener = allClear
    ? "Nothing is yelling at you and nothing's due this week. Keep the streak going."
    : "Here's where you stand this week.";

  const blocks: string[] = [`Hi ${person.name},`, opener];
  if (fights.length) {
    blocks.push([`YOUR FIGHTS (${fights.length})`, ...fightLines].join("\n"));
  }
  if (due.length) {
    blocks.push(
      [
        `DUE THIS WEEK (${due.length})`,
        "Clear these before they turn into fights.",
        ...dueLines,
      ].join("\n")
    );
  }
  if (projects.length) {
    blocks.push(
      [
        `YOUR PROJECTS (${projects.length})`,
        "Days since each last showed progress.",
        ...projectLines,
      ].join("\n")
    );
  }
  blocks.push(
    `— ${settings.labName} Manager · automated weekly digest. Turn this off on your Account page.`
  );

  return { subject, text: blocks.join("\n\n") };
}
