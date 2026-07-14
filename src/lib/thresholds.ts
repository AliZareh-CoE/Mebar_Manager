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

/** Board age pill: green up to here… */
export const AGE_FRESH_DAYS = 7;
/** …amber up to here, red beyond. */
export const AGE_AGING_DAYS = 14;
