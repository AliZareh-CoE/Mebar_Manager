/**
 * The canonical performance-metric list. Tiny and dependency-free (like
 * fight-types.ts) so the pure engine, settings schema, and admin editor can
 * all import it without cycles.
 *
 * Scores are computed from the record — nobody grades anybody. Weights are
 * admin-tunable; these are the stock values.
 */

export const PERFORMANCE_CATEGORIES = ["DELIVERY", "DISCIPLINE", "INITIATIVE"] as const;
export type PerformanceCategory = (typeof PERFORMANCE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<PerformanceCategory, string> = {
  DELIVERY: "Delivery",
  DISCIPLINE: "Discipline",
  INITIATIVE: "Initiative-taking",
};

export const PERFORMANCE_METRICS = [
  // Delivery (+): closing things out, on the record.
  "milestoneDone",
  "milestoneOnTime",
  "blockerResolved",
  "taskDone",
  "taskOnTime",
  "dataRequestDelivered",
  "dataRequestOnTime",
  "decisionDecided",
  "decisionOnTime",
  "computeDecided",
  "computeResultsSubmitted",
  "initiativeWon",
  "paperSubmitted",
  "paperAccepted",
  // Discipline (±): the weekly rhythm, and what you let rot.
  "updatePosted",
  "overdueOwnedItem",
  "decisionAutoProceeded",
  // Initiative-taking (+): starting fights instead of suffering silently.
  "proposalFiled",
  "blockerRaised",
  "taskFiled",
  "dataRequestFiled",
  "initiativeFiled",
] as const;
export type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];

export const METRIC_CATEGORY: Record<PerformanceMetric, PerformanceCategory> = {
  milestoneDone: "DELIVERY",
  milestoneOnTime: "DELIVERY",
  blockerResolved: "DELIVERY",
  taskDone: "DELIVERY",
  taskOnTime: "DELIVERY",
  dataRequestDelivered: "DELIVERY",
  dataRequestOnTime: "DELIVERY",
  decisionDecided: "DELIVERY",
  decisionOnTime: "DELIVERY",
  computeDecided: "DELIVERY",
  computeResultsSubmitted: "DELIVERY",
  initiativeWon: "DELIVERY",
  paperSubmitted: "DELIVERY",
  paperAccepted: "DELIVERY",
  updatePosted: "DISCIPLINE",
  overdueOwnedItem: "DISCIPLINE",
  decisionAutoProceeded: "DISCIPLINE",
  proposalFiled: "INITIATIVE",
  blockerRaised: "INITIATIVE",
  taskFiled: "INITIATIVE",
  dataRequestFiled: "INITIATIVE",
  initiativeFiled: "INITIATIVE",
};

export const METRIC_LABELS: Record<PerformanceMetric, string> = {
  milestoneDone: "Milestones completed",
  milestoneOnTime: "…of which on time (bonus)",
  blockerResolved: "Blockers resolved",
  taskDone: "Tasks completed",
  taskOnTime: "…of which on time (bonus)",
  dataRequestDelivered: "Data requests delivered",
  dataRequestOnTime: "…of which on time (bonus)",
  decisionDecided: "Decisions answered",
  decisionOnTime: "…of which before the timeout (bonus)",
  computeDecided: "Compute requests decided",
  computeResultsSubmitted: "Compute results submitted",
  initiativeWon: "Initiatives won",
  paperSubmitted: "Papers submitted",
  paperAccepted: "Papers accepted",
  updatePosted: "Weekly updates posted",
  overdueOwnedItem: "Items currently overdue on you",
  decisionAutoProceeded: "Decisions you let auto-proceed",
  proposalFiled: "Proposals filed",
  blockerRaised: "Blockers raised",
  taskFiled: "Tasks filed",
  dataRequestFiled: "Data requests filed",
  initiativeFiled: "Initiatives filed",
};

export const DEFAULT_PERFORMANCE_WEIGHTS: Record<PerformanceMetric, number> = {
  milestoneDone: 3,
  milestoneOnTime: 1,
  blockerResolved: 2,
  taskDone: 2,
  taskOnTime: 1,
  dataRequestDelivered: 2,
  dataRequestOnTime: 1,
  decisionDecided: 1,
  decisionOnTime: 1,
  computeDecided: 1,
  computeResultsSubmitted: 2,
  initiativeWon: 5,
  // A Q1 acceptance outranking everything is the point.
  paperSubmitted: 3,
  paperAccepted: 8,
  updatePosted: 1,
  overdueOwnedItem: -2,
  decisionAutoProceeded: -3,
  proposalFiled: 2,
  blockerRaised: 1,
  taskFiled: 1,
  dataRequestFiled: 1,
  initiativeFiled: 2,
};
