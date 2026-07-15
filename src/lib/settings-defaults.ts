import { workflowSchema, type Workflow } from "@/lib/workflow";
import type { ProposalQuestion } from "@/lib/proposal";
import { FIGHT_TYPES, type FightType } from "@/lib/fight-types";

/** An admin-editable category: archived items keep rendering on old rows. */
export interface TaxonomyItem {
  key: string;
  label: string;
  archived: boolean;
}

/** A compute server type; mandatoryPractices are forced on every request. */
export interface ServerTypeItem extends TaxonomyItem {
  mandatoryPractices: string[];
}

export const DEFAULT_CAUSE_TAGS: TaxonomyItem[] = [
  { key: "WAITING_DECISION", label: "Waiting on a decision", archived: false },
  { key: "WAITING_EQUIPMENT", label: "Waiting on equipment", archived: false },
  { key: "TECHNICAL", label: "Technical problem", archived: false },
  { key: "WAITING_EXTERNAL", label: "Waiting on external party", archived: false },
  { key: "KNOWLEDGE_GAP", label: "Knowledge gap", archived: false },
  { key: "OTHER", label: "Other", archived: false },
];

// The MULTI_GPU ⇒ DDP_FSDP mandate is data now, not a hardcoded rule.
export const DEFAULT_SERVER_TYPES: ServerTypeItem[] = [
  { key: "CPU", label: "CPU", archived: false, mandatoryPractices: [] },
  { key: "SINGLE_GPU", label: "Single GPU", archived: false, mandatoryPractices: [] },
  { key: "MULTI_GPU", label: "Multi-GPU", archived: false, mandatoryPractices: ["DDP_FSDP"] },
];

/** Per-rule Fight List section config: the switch, title, and blurb. */
export interface FightRuleConfig {
  enabled: boolean;
  title: string;
  blurb: string;
}

export const DEFAULT_FIGHT_SECTIONS: Record<FightType, FightRuleConfig> = {
  STALLED_PROJECT: {
    enabled: true,
    title: "Stalled projects",
    blurb: "No update past the stall threshold. One update ends the fight.",
  },
  PAST_REVIVE: {
    enabled: true,
    title: "Past their revive date",
    blurb: "Paused is a promise with a date. The date passed.",
  },
  OVERDUE_BLOCKER: {
    enabled: true,
    title: "Overdue blockers",
    blurb: "These had deadlines. The deadlines lost.",
  },
  UNOWNED_BLOCKER: {
    enabled: true,
    title: "Unowned blockers",
    blurb: "Nobody's job = nobody does it. Assign an owner.",
  },
  PENDING_DECISION: {
    enabled: true,
    title: "Decisions waiting",
    blurb: "Answer them, or the engineer proceeds with their recommendation.",
  },
  MISSED_MILESTONE: {
    enabled: true,
    title: "Missed milestones",
    blurb: "Close them, or push the date deliberately.",
  },
  OVERDUE_DATA_REQUEST: {
    enabled: true,
    title: "Overdue data requests",
    blurb: "The needed-by date passed. The analyst delivers, or the advisor fights.",
  },
  UNOWNED_DATA_REQUEST: {
    enabled: true,
    title: "Unowned data requests",
    blurb: "No analyst has claimed these. Assign one.",
  },
  PENDING_COMPUTE_REQUEST: {
    enabled: true,
    title: "Compute requests waiting",
    blurb: "These never auto-proceed. The coordinator approves or denies — with a reason.",
  },
  OVERDUE_COMPUTE_RESULTS: {
    enabled: true,
    title: "Compute results owed",
    blurb: "The window closed. Where are the results, and did you retrieve your data?",
  },
  OVERDUE_TASK: {
    enabled: true,
    title: "Overdue tasks",
    blurb: "The deadline passed. The secretary delivers, or the requester fights.",
  },
  UNOWNED_TASK: {
    enabled: true,
    title: "Unowned tasks",
    blurb: "No secretary has claimed these. Assign one.",
  },
  OVERDUE_INITIATIVE: {
    enabled: true,
    title: "Overdue initiatives",
    blurb: "The lab's big fights, past their deadline. Only leadership sees these.",
  },
  UNOWNED_INITIATIVE: {
    enabled: true,
    title: "Unowned initiatives",
    blurb: "Nobody is fighting these yet. Claim one.",
  },
  MISSING_PROJECT_PEOPLE: {
    enabled: true,
    title: "Missing PI / first author",
    blurb:
      "Active projects must name a PI and a first author. Activation is blocked without them.",
  },
};

export const DEFAULT_SECTION_ORDER: FightType[] = [...FIGHT_TYPES];

// The Heilmeier Catechism — DARPA's gauntlet. Keys are projects columns.
export const DEFAULT_PROPOSAL_QUESTIONS: ProposalQuestion[] = [
  { key: "objective", label: "What are we trying to do? (no jargon)", builtin: true, archived: false },
  { key: "howItsDoneToday", label: "How is it done today, and what are the limits?", builtin: true, archived: false },
  { key: "whatsNew", label: "What's new in our approach — why will it succeed?", builtin: true, archived: false },
  { key: "whoCares", label: "Who cares if we succeed?", builtin: true, archived: false },
  { key: "risks", label: "What are the risks?", builtin: true, archived: false },
  { key: "killCriteria", label: "Kill criteria — what result makes us stop?", builtin: true, archived: false },
  { key: "successCriteria", label: "Success criteria — the mid-term and final exams", builtin: true, archived: false },
];

// Card badges show the part before " — " when a label carries a long tail.
export const DEFAULT_PRACTICES: TaxonomyItem[] = [
  { key: "VECTORIZED_OPS", label: "Vectorized operations (no per-sample Python loops)", archived: false },
  { key: "CACHING", label: "Caching to avoid redundant computation", archived: false },
  { key: "CHECKPOINTING", label: "Resumable jobs with checkpoint saving", archived: false },
  { key: "CUPY", label: "CuPy for GPU-accelerated array work", archived: false },
  { key: "AMP", label: "Mixed-precision training (AMP)", archived: false },
  { key: "DALI", label: "NVIDIA DALI data-loading pipelines", archived: false },
  { key: "DDP_FSDP", label: "Distributed training (DDP / FSDP)", archived: false },
  { key: "GRAD_ACCUM", label: "Gradient accumulation for larger effective batches", archived: false },
  { key: "TENSORRT", label: "TensorRT-optimized inference", archived: false },
];

/**
 * Stock configuration — what a lab gets before an admin customizes anything.
 * Pure module (no server-only): seed, tests, and client editors import it.
 *
 * DEFAULT_WORKFLOW reproduces the original hardcoded lifecycle exactly:
 * PROPOSAL → SCOPING → ACTIVE ⇄ BLOCKED, ACTIVE|BLOCKED → PAUSED → ACTIVE,
 * ACTIVE → DONE, anything non-terminal → KILLED.
 */
export const DEFAULT_WORKFLOW: Workflow = workflowSchema.parse({
  states: [
    {
      key: "PROPOSAL",
      label: "Proposal",
      color: "slate",
      description: "Filed, waiting for approval to scope.",
      flags: { initial: true },
    },
    {
      key: "SCOPING",
      label: "Scoping",
      color: "blue",
      description: "Approved — defining milestones and the Heilmeier answers.",
    },
    {
      key: "ACTIVE",
      label: "Active",
      color: "green",
      description: "Moving. Weekly updates keep it off the Fight List.",
      flags: { countsForStall: true, resetsStallClock: true },
    },
    {
      key: "BLOCKED",
      label: "Blocked",
      color: "red",
      description: "Stuck on a blocker — still expected to fight it weekly.",
      flags: { countsForStall: true },
    },
    {
      key: "PAUSED",
      label: "Paused",
      color: "amber",
      description: "Deliberately parked, with a reason and a revive date.",
      flags: { paused: true },
    },
    {
      key: "DONE",
      label: "Done",
      color: "emerald",
      description: "Shipped. A respectable ending.",
      flags: { terminal: true },
    },
    {
      key: "KILLED",
      label: "Killed",
      color: "muted",
      description: "Stopped on purpose. Also a respectable ending.",
      flags: { terminal: true, hideFromBoard: true },
    },
  ],
  transitions: [
    { key: "APPROVE", from: "PROPOSAL", to: "SCOPING", label: "Approve for scoping", gate: "project.approve" },
    { key: "START", from: "SCOPING", to: "ACTIVE", label: "Start project" },
    { key: "BLOCK", from: "ACTIVE", to: "BLOCKED", label: "Mark blocked" },
    { key: "UNBLOCK", from: "BLOCKED", to: "ACTIVE", label: "Unblock" },
    { key: "PAUSE", from: "ACTIVE", to: "PAUSED", label: "Pause" },
    { key: "PAUSE", from: "BLOCKED", to: "PAUSED", label: "Pause" },
    { key: "REVIVE", from: "PAUSED", to: "ACTIVE", label: "Revive" },
    { key: "COMPLETE", from: "ACTIVE", to: "DONE", label: "Mark done" },
    ...["PROPOSAL", "SCOPING", "ACTIVE", "BLOCKED", "PAUSED"].map((from) => ({
      key: "KILL",
      from,
      to: "KILLED",
      label: "Kill project",
      gate: "project.kill" as const,
      requiresReason: true,
      destructive: true,
    })),
  ],
});
