import { workflowSchema, type Workflow } from "@/lib/workflow";

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
