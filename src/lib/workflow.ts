import { z } from "zod";
import type { Role } from "@/lib/auth";

/**
 * The project workflow, table-driven and admin-editable.
 *
 * States carry semantic FLAGS instead of hardcoded meaning: the fight engine,
 * board, and actions ask "does this state count for stall? is it paused? is
 * it terminal?" rather than comparing against literal keys. That's what lets
 * an admin add, rename, or retire states without touching code. Transitions
 * are plain rows (from → to) with a label, a gate, and dialog hints.
 *
 * Pure module — no server-only, no DB imports. The admin editor (client),
 * server actions, and vitest all import it.
 */

/** UPPER_SNAKE keys, matching the style of the built-in states. */
export const KEY_RE = /^[A-Z][A-Z0-9_]{0,29}$/;

/**
 * Fixed palette — each name maps to precompiled Tailwind classes in
 * state-badge.tsx (class strings can't be built dynamically).
 */
export const STATE_COLORS = [
  "slate",
  "blue",
  "green",
  "red",
  "amber",
  "emerald",
  "violet",
  "cyan",
  "orange",
  "pink",
  "muted",
] as const;
export type StateColor = (typeof STATE_COLORS)[number];

export const stateFlagsSchema = z.object({
  /** New projects start here. Exactly one non-archived state has this. */
  initial: z.boolean().default(false),
  /** The stall rule and age pill watch this state (ACTIVE, BLOCKED). */
  countsForStall: z.boolean().default(false),
  /** Entry requires a reason + revive date; the past-revive rule watches it. */
  paused: z.boolean().default(false),
  /** No way out — final states (DONE, KILLED). */
  terminal: z.boolean().default(false),
  /** Transitions INTO this state reset the stall clock (ACTIVE). */
  resetsStallClock: z.boolean().default(false),
  /** The board's default (unfiltered) view hides it (KILLED). */
  hideFromBoard: z.boolean().default(false),
});
export type StateFlags = z.infer<typeof stateFlagsSchema>;

export const workflowStateSchema = z.object({
  key: z.string().regex(KEY_RE, "State keys are UPPER_SNAKE, max 30 chars."),
  label: z.string().trim().min(1).max(30),
  color: z.enum(STATE_COLORS).default("slate"),
  description: z.string().trim().max(200).default(""),
  /** Archived states keep rendering on existing projects but accept no new entries. */
  archived: z.boolean().default(false),
  flags: stateFlagsSchema.default(() => stateFlagsSchema.parse({})),
});
export type WorkflowState = z.infer<typeof workflowStateSchema>;

/**
 * Who may fire a transition. "everyone" means anyone who can see the
 * project — visibility bounds it, not role. The two capability gates keep
 * honoring the admin's permission-matrix overrides.
 */
export const TRANSITION_GATES = [
  "everyone",
  "manager",
  "project.approve",
  "project.kill",
] as const;
export type TransitionGate = (typeof TRANSITION_GATES)[number];

export const workflowTransitionSchema = z.object({
  /** Event key — unique per source state, may repeat across states (KILL). */
  key: z.string().regex(KEY_RE, "Event keys are UPPER_SNAKE, max 30 chars."),
  from: z.string(),
  to: z.string(),
  /** Button text; also the success toast ("<label> — done."). */
  label: z.string().trim().min(1).max(40),
  gate: z.enum(TRANSITION_GATES).default("everyone"),
  /** Opens a "say why, for the record" dialog; logged to the history. */
  requiresReason: z.boolean().default(false),
  /** Red button styling for high-stakes calls. */
  destructive: z.boolean().default(false),
});
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;

export const workflowSchema = z
  .object({
    states: z.array(workflowStateSchema).min(1).max(20),
    transitions: z.array(workflowTransitionSchema).max(80),
  })
  .superRefine((wf, ctx) => {
    const seen = new Set<string>();
    for (const s of wf.states) {
      if (seen.has(s.key)) {
        ctx.addIssue({ code: "custom", message: `Duplicate state key "${s.key}".` });
      }
      seen.add(s.key);
    }

    const initials = wf.states.filter((s) => !s.archived && s.flags.initial);
    if (initials.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Exactly one non-archived state must be marked as the starting state.",
      });
    }
    if (wf.states.some((s) => s.archived && s.flags.initial)) {
      ctx.addIssue({ code: "custom", message: "The starting state can't be archived." });
    }

    const byKey = new Map(wf.states.map((s) => [s.key, s]));
    const pairs = new Set<string>();
    for (const t of wf.transitions) {
      const from = byKey.get(t.from);
      const to = byKey.get(t.to);
      if (!from || !to) {
        ctx.addIssue({
          code: "custom",
          message: `Transition "${t.label}" references a state that doesn't exist.`,
        });
        continue;
      }
      if (from.flags.terminal) {
        ctx.addIssue({
          code: "custom",
          message: `"${from.label}" is terminal — it can't have outgoing transitions.`,
        });
      }
      const pair = `${t.from}→${t.key}`;
      if (pairs.has(pair)) {
        ctx.addIssue({
          code: "custom",
          message: `Two transitions from ${t.from} share the event key "${t.key}".`,
        });
      }
      pairs.add(pair);
    }
  });
export type Workflow = z.infer<typeof workflowSchema>;

/**
 * Derive a stable UPPER_SNAKE key from a human label. Keys are immutable
 * after creation (they live in DB rows and URLs) — renames only touch the
 * label. Collides against `taken` (including archived keys, never reused).
 */
export function slugifyKey(label: string, taken: Iterable<string>): string {
  let base = label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 27);
  if (!/^[A-Z]/.test(base)) base = `K${base ? "_" + base : "EY"}`.slice(0, 27);
  const takenSet = new Set(taken);
  if (!takenSet.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`.slice(0, 30);
    if (!takenSet.has(candidate)) return candidate;
  }
}

/**
 * Non-fatal editor advisories: shapes an admin may legitimately save
 * mid-edit, but that will strand projects if left that way.
 */
export function workflowWarnings(wf: Workflow): string[] {
  const byKey = new Map(wf.states.map((s) => [s.key, s]));
  const warnings: string[] = [];
  for (const s of wf.states) {
    if (s.archived || s.flags.terminal) continue;
    const liveExits = wf.transitions.filter((t) => {
      if (t.from !== s.key) return false;
      const target = byKey.get(t.to);
      return !!target && !target.archived;
    });
    if (liveExits.length === 0) {
      warnings.push(
        `"${s.label}" has no way out — projects entering it will be stuck until you add a transition.`
      );
    }
  }
  return warnings;
}

// ————————————————————————————————————————————————————————————— engine

const DAY_MS = 86_400_000;

/**
 * UTC start of the day containing `d`. HTML date inputs parse as UTC
 * midnight, so comparing against the raw `now` instant would reject a
 * perfectly good "tomorrow" for users west of UTC. Same-UTC-day or later
 * counts as valid.
 */
export function utcDayStart(d: Date): Date {
  return new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);
}

export type WorkflowEvent = {
  type: string;
  pauseReason?: string;
  reviveDate?: Date;
  now?: Date;
};

/** Predicate deciding whether the actor may fire a transition. */
export type TransitionGateFn = (t: WorkflowTransition) => boolean;

/** Role shorthand for tests: managers pass every gate, others only "everyone". */
function normalizeGate(gate: Role | TransitionGateFn): TransitionGateFn {
  if (typeof gate === "function") return gate;
  return gate === "MANAGER" ? () => true : (t) => t.gate === "everyone";
}

export type ApplyResult =
  | { ok: true; next: string; transition: WorkflowTransition }
  | { ok: false; error: string };

/**
 * Validate and apply an event to a project state. Pure — the caller persists
 * the result.
 */
export function applyEvent(
  wf: Workflow,
  state: string,
  event: WorkflowEvent,
  gate: Role | TransitionGateFn
): ApplyResult {
  const transition = wf.transitions.find((t) => t.from === state && t.key === event.type);
  if (!transition) {
    const label = wf.transitions.find((t) => t.key === event.type)?.label ?? event.type;
    const stateLabel = stateByKey(wf, state)?.label ?? state;
    return { ok: false, error: `"${label}" is not possible from ${stateLabel}.` };
  }

  if (!normalizeGate(gate)(transition)) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  const target = stateByKey(wf, transition.to);
  if (!target) {
    return { ok: false, error: "This transition points at a state that no longer exists." };
  }
  if (target.archived) {
    return {
      ok: false,
      error: `"${target.label}" has been retired by an admin — this path is closed.`,
    };
  }

  if (target.flags.paused) {
    if (!event.pauseReason?.trim()) {
      return { ok: false, error: "Pausing requires a reason." };
    }
    if (!event.reviveDate) {
      return { ok: false, error: "Pausing requires a revive date." };
    }
    const now = event.now ?? new Date();
    if (event.reviveDate.getTime() < utcDayStart(now).getTime()) {
      return { ok: false, error: "The revive date can't be in the past." };
    }
  }

  return { ok: true, next: transition.to, transition };
}

/** Transitions the actor may fire from a state — drives the UI buttons. */
export function availableTransitions(
  wf: Workflow,
  state: string,
  gate: Role | TransitionGateFn
): WorkflowTransition[] {
  const g = normalizeGate(gate);
  return wf.transitions.filter((t) => {
    if (t.from !== state || !g(t)) return false;
    const target = stateByKey(wf, t.to);
    return !!target && !target.archived;
  });
}

/** What a transition button needs to render its dialog, minus the graph. */
export type TransitionDescriptor = {
  key: string;
  label: string;
  /** Target is a paused-flagged state → reason + revive-date dialog. */
  needsPauseFields: boolean;
  requiresReason: boolean;
  destructive: boolean;
};

export function transitionDescriptors(
  wf: Workflow,
  state: string,
  gate: Role | TransitionGateFn
): TransitionDescriptor[] {
  return availableTransitions(wf, state, gate).map((t) => ({
    key: t.key,
    label: t.label,
    needsPauseFields: stateByKey(wf, t.to)?.flags.paused ?? false,
    requiresReason: t.requiresReason,
    destructive: t.destructive,
  }));
}

// ——————————————————————————————————————————————————————————— selectors

export function stateByKey(wf: Workflow, key: string): WorkflowState | undefined {
  return wf.states.find((s) => s.key === key);
}

export function initialStateKey(wf: Workflow): string {
  const initial = wf.states.find((s) => !s.archived && s.flags.initial);
  return (initial ?? wf.states.find((s) => !s.archived) ?? wf.states[0]).key;
}

/** Terminal or paused — nothing on these projects fights or expires. */
export function frozenStateKeys(wf: Workflow): string[] {
  return wf.states.filter((s) => s.flags.terminal || s.flags.paused).map((s) => s.key);
}

export function stallStateKeys(wf: Workflow): string[] {
  return wf.states.filter((s) => s.flags.countsForStall).map((s) => s.key);
}

export function pausedStateKeys(wf: Workflow): string[] {
  return wf.states.filter((s) => s.flags.paused).map((s) => s.key);
}

/** Transitions INTO these states reset the stall clock. */
export function activationStateKeys(wf: Workflow): string[] {
  return wf.states.filter((s) => s.flags.resetsStallClock).map((s) => s.key);
}

/** Board's default view hides these. */
export function hiddenFromBoardKeys(wf: Workflow): string[] {
  return wf.states.filter((s) => s.flags.hideFromBoard).map((s) => s.key);
}

/**
 * Display info for a state key. Unknown keys (hand-edited DBs, states
 * deleted before archive-on-remove existed) render as muted raw keys
 * instead of crashing history views.
 */
export function resolveStateDisplay(
  wf: Workflow,
  key: string
): { label: string; color: StateColor } {
  const s = stateByKey(wf, key);
  return s ? { label: s.label, color: s.color } : { label: key, color: "muted" };
}

/** Per-state semantics in the shape the fight engine consumes. */
export function engineStateFlags(
  wf: Workflow
): Record<string, { frozen: boolean; countsForStall: boolean; paused: boolean }> {
  return Object.fromEntries(
    wf.states.map((s) => [
      s.key,
      {
        frozen: s.flags.terminal || s.flags.paused,
        countsForStall: s.flags.countsForStall,
        paused: s.flags.paused,
      },
    ])
  );
}
