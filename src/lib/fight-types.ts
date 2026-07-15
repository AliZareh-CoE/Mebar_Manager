/**
 * The canonical fight-rule list. Tiny and dependency-free so the engine,
 * settings schema, and admin editor can all import it without cycles.
 * Order here is the stock Fight List section order.
 */
export const FIGHT_TYPES = [
  "STALLED_PROJECT",
  "PAST_REVIVE",
  "OVERDUE_BLOCKER",
  "OVERDUE_DATA_REQUEST",
  "OVERDUE_TASK",
  "OVERDUE_COMPUTE_RESULTS",
  "UNOWNED_BLOCKER",
  "UNOWNED_DATA_REQUEST",
  "UNOWNED_TASK",
  "PENDING_COMPUTE_REQUEST",
  "PENDING_DECISION",
  "MISSED_MILESTONE",
  // Appended (not inserted) — saved section orders self-heal by appending
  // missing types, so the end is the stable place for new rules.
  "OVERDUE_INITIATIVE",
  "UNOWNED_INITIATIVE",
  "MISSING_PROJECT_PEOPLE",
] as const;
export type FightType = (typeof FIGHT_TYPES)[number];
