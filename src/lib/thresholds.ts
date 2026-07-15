/**
 * The numbers the whole system argues from. Tests and UI copy both read
 * these — change them here and everything stays consistent.
 */

/** ACTIVE/BLOCKED project with no update for this many days = stalled. */
export const STALL_DAYS = 14;

/** OPEN blocker with no owner for this many days = escalate to advisor. */
export const UNOWNED_BLOCKER_DAYS = 2;

/** Pending decision auto-proceeds with the recommendation after this. */
export const DECISION_TIMEOUT_HOURS = 48;

/** Pending decision turns red this many hours before it auto-proceeds. */
export const DECISION_URGENT_HOURS = 12;

/** Pending compute request turns red (sev 3) after this many hours unanswered. */
export const COMPUTE_PENDING_URGENT_HOURS = 48;

/** Approved compute past its window turns red after this many extra days without results. */
export const COMPUTE_RESULTS_URGENT_DAYS = 7;

/** Board age pill: green up to here… */
export const AGE_FRESH_DAYS = 7;
/** …amber up to here, red beyond. */
export const AGE_AGING_DAYS = 14;

/** Active project may exist this many days before "no paper" is a fight. */
export const PAPER_GRACE_DAYS = 30;

/** Every researcher runs at least this many active projects. 0 disables. */
export const MIN_ACTIVE_PROJECTS = 5;
