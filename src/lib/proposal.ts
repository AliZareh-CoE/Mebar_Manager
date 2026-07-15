/**
 * Proposal-question plumbing, pure and testable.
 *
 * The 7 built-in Heilmeier questions each map to a fixed projects column;
 * admin-added custom questions store their answers in the projects
 * `extraAnswers` JSON blob, keyed by question key. Form inputs for custom
 * questions are named `q_<key>` so they can never collide with column names.
 */

export const HEILMEIER_COLUMNS = [
  "objective",
  "howItsDoneToday",
  "whatsNew",
  "whoCares",
  "risks",
  "killCriteria",
  "successCriteria",
] as const;
export type HeilmeierColumn = (typeof HEILMEIER_COLUMNS)[number];

export interface ProposalQuestion {
  key: string;
  label: string;
  /** Built-ins live in projects columns; they can be archived, not removed. */
  builtin: boolean;
  /** Archived questions leave the form; existing answers keep rendering. */
  archived: boolean;
}

export function proposalFieldName(q: Pick<ProposalQuestion, "key" | "builtin">): string {
  return q.builtin ? q.key : `q_${q.key}`;
}

/**
 * Split submitted answers into column patches and the extraAnswers blob.
 * Archived questions and absent fields are left untouched (edit safety);
 * pass the row's current extraAnswers so custom answers survive edits.
 */
export function collectProposalAnswers(
  questions: ProposalQuestion[],
  formData: { get(name: string): unknown },
  existingExtra: Record<string, string> = {}
): {
  columns: Partial<Record<HeilmeierColumn, string>>;
  extraAnswers: Record<string, string>;
} {
  const columns: Partial<Record<HeilmeierColumn, string>> = {};
  const extraAnswers: Record<string, string> = { ...existingExtra };
  for (const q of questions) {
    if (q.archived) continue;
    const raw = formData.get(proposalFieldName(q));
    if (raw === null || raw === undefined) continue;
    const value = String(raw).trim();
    if (q.builtin) columns[q.key as HeilmeierColumn] = value;
    else extraAnswers[q.key] = value;
  }
  return { columns, extraAnswers };
}
