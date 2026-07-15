import { workflowSchema, type Workflow } from "@/lib/workflow";

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
