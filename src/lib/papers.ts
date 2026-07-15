import type { PaperStatus } from "@/lib/db/schema";

/**
 * The paper lifecycle — pure, so actions, UI, and tests share one map.
 * One row = one logical manuscript: a rejection resubmitted to a new venue
 * is the same fight (submittedAt refreshes, closure clears). A genuinely
 * different manuscript is a new paper row.
 */

export const PAPER_TRANSITIONS: Record<PaperStatus, PaperStatus[]> = {
  DRAFTING: ["SUBMITTED"],
  SUBMITTED: ["ACCEPTED", "REJECTED", "WITHDRAWN"],
  REJECTED: ["SUBMITTED"],
  WITHDRAWN: ["SUBMITTED"],
  ACCEPTED: [], // terminal — the whole point
};

export function canTransitionPaper(from: PaperStatus, to: PaperStatus): boolean {
  return PAPER_TRANSITIONS[from].includes(to);
}

/** Field requirements per target status, enforced by the action + dialogs. */
export function transitionRequirements(to: PaperStatus): {
  needsVenue: boolean;
  needsClosureNote: boolean;
} {
  return {
    // You submit TO somewhere — a submission without a venue is a draft.
    needsVenue: to === "SUBMITTED",
    // Rejections and withdrawals carry their reason on the record.
    needsClosureNote: to === "REJECTED" || to === "WITHDRAWN",
  };
}

/** Human labels + button copy for the status buttons. */
export const PAPER_STATUS_LABELS: Record<PaperStatus, string> = {
  DRAFTING: "Drafting",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const PAPER_TRANSITION_LABELS: Record<PaperStatus, string> = {
  DRAFTING: "Back to drafting", // unused (no transition targets DRAFTING)
  SUBMITTED: "Submit…",
  ACCEPTED: "Accepted 🎉",
  REJECTED: "Rejected…",
  WITHDRAWN: "Withdraw…",
};

/**
 * Column updates for a transition. Resubmitting clears the closure pair —
 * the same way pause columns clear on leaving a paused state.
 */
export function transitionColumns(
  to: PaperStatus,
  now: Date,
  fields: { venue?: string; closureNote?: string }
): {
  status: PaperStatus;
  submittedAt?: Date;
  acceptedAt?: Date;
  closedAt?: Date | null;
  closureNote?: string | null;
  venue?: string;
} {
  switch (to) {
    case "SUBMITTED":
      return {
        status: to,
        submittedAt: now,
        closedAt: null,
        closureNote: null,
        ...(fields.venue ? { venue: fields.venue } : {}),
      };
    case "ACCEPTED":
      return { status: to, acceptedAt: now };
    case "REJECTED":
    case "WITHDRAWN":
      return { status: to, closedAt: now, closureNote: fields.closureNote ?? null };
    case "DRAFTING":
      return { status: to };
  }
}
