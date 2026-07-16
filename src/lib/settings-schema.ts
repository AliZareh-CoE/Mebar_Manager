import { z } from "zod";
import { permissionMatrixSchema } from "@/lib/policy";
import { workflowSchema, KEY_RE } from "@/lib/workflow";
import {
  DEFAULT_WORKFLOW,
  DEFAULT_CAUSE_TAGS,
  DEFAULT_SERVER_TYPES,
  DEFAULT_PRACTICES,
  DEFAULT_PROPOSAL_QUESTIONS,
  DEFAULT_FIGHT_SECTIONS,
  DEFAULT_SECTION_ORDER,
  DEFAULT_HANDBOOK,
  type FightRuleConfig,
} from "@/lib/settings-defaults";
import { HEILMEIER_COLUMNS } from "@/lib/proposal";
import { FIGHT_TYPES, type FightType } from "@/lib/fight-types";
import {
  DEFAULT_PERFORMANCE_WEIGHTS,
  PERFORMANCE_METRICS,
  type PerformanceMetric,
} from "@/lib/performance-metrics";
import {
  STALL_DAYS,
  UNOWNED_BLOCKER_DAYS,
  DECISION_TIMEOUT_HOURS,
  DECISION_URGENT_HOURS,
  COMPUTE_PENDING_URGENT_HOURS,
  COMPUTE_RESULTS_URGENT_DAYS,
  AGE_FRESH_DAYS,
  AGE_AGING_DAYS,
  PAPER_GRACE_DAYS,
  MIN_ACTIVE_PROJECTS,
  SUBMISSION_LEAD_DAYS,
} from "@/lib/thresholds";

/**
 * Lab-wide settings shape, admin-editable at /admin/settings. Pure module —
 * getSettings() (server-only) lives in settings.ts; tests and client
 * editors import from here.
 *
 * Everything has a default (thresholds.ts constants and settings-defaults.ts
 * stay the single sources), so a missing row degrades to stock behavior.
 * Complex slices are additionally `.catch`-wrapped: a corrupt workflow blob
 * degrades ONLY the workflow to stock, not the lab name or permissions.
 */

export const thresholdSettingsSchema = z.object({
  stallDays: z.coerce.number().int().min(1).max(365).default(STALL_DAYS),
  unownedGraceDays: z.coerce.number().int().min(0).max(60).default(UNOWNED_BLOCKER_DAYS),
  decisionTimeoutHours: z.coerce.number().int().min(1).max(720).default(DECISION_TIMEOUT_HOURS),
  decisionUrgentHours: z.coerce.number().int().min(0).max(720).default(DECISION_URGENT_HOURS),
  computePendingUrgentHours: z.coerce
    .number()
    .int()
    .min(1)
    .max(720)
    .default(COMPUTE_PENDING_URGENT_HOURS),
  computeResultsUrgentDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .default(COMPUTE_RESULTS_URGENT_DAYS),
  ageFreshDays: z.coerce.number().int().min(0).max(365).default(AGE_FRESH_DAYS),
  ageAgingDays: z.coerce.number().int().min(0).max(365).default(AGE_AGING_DAYS),
  paperGraceDays: z.coerce.number().int().min(0).max(365).default(PAPER_GRACE_DAYS),
  minActiveProjects: z.coerce.number().int().min(0).max(50).default(MIN_ACTIVE_PROJECTS),
  submissionLeadDays: z.coerce.number().int().min(0).max(365).default(SUBMISSION_LEAD_DAYS),
});
export type ThresholdSettings = z.infer<typeof thresholdSettingsSchema>;

export const taxonomyItemSchema = z.object({
  key: z.string().regex(KEY_RE, "Keys are UPPER_SNAKE, max 30 chars."),
  label: z.string().trim().min(1).max(80),
  archived: z.boolean().default(false),
});
export type TaxonomyItemInput = z.infer<typeof taxonomyItemSchema>;

export const serverTypeSchema = taxonomyItemSchema.extend({
  /** Practice keys every request on this server type must commit to. */
  mandatoryPractices: z.array(z.string().regex(KEY_RE)).default([]),
});

/** Unique keys + at least one non-archived entry. */
function taxonomyList<T extends z.ZodType<{ key: string; archived: boolean }>>(
  item: T,
  max: number
) {
  return z
    .array(item)
    .min(1)
    .max(max)
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      for (const i of items) {
        if (seen.has(i.key)) {
          ctx.addIssue({ code: "custom", message: `Duplicate key "${i.key}".` });
        }
        seen.add(i.key);
      }
      if (!items.some((i) => !i.archived)) {
        ctx.addIssue({ code: "custom", message: "At least one entry must stay active." });
      }
    });
}

export const causeTagListSchema = taxonomyList(taxonomyItemSchema, 30);
export const serverTypeListSchema = taxonomyList(serverTypeSchema, 15);
export const practiceListSchema = taxonomyList(taxonomyItemSchema, 30);

export const proposalQuestionSchema = z.object({
  // Built-in keys are camelCase column names; custom keys are slugified.
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/),
  label: z.string().trim().min(1).max(160),
  builtin: z.boolean().default(false),
  archived: z.boolean().default(false),
});

export const proposalQuestionListSchema = z
  .array(proposalQuestionSchema)
  .max(20)
  .superRefine((questions, ctx) => {
    const seen = new Set<string>();
    for (const q of questions) {
      if (seen.has(q.key)) {
        ctx.addIssue({ code: "custom", message: `Duplicate question key "${q.key}".` });
      }
      seen.add(q.key);
      if (q.builtin !== (HEILMEIER_COLUMNS as readonly string[]).includes(q.key)) {
        ctx.addIssue({
          code: "custom",
          message: `"${q.key}" has the wrong builtin flag.`,
        });
      }
    }
    for (const col of HEILMEIER_COLUMNS) {
      if (!questions.some((q) => q.key === col)) {
        ctx.addIssue({
          code: "custom",
          message: `Built-in question "${col}" can be archived but not removed.`,
        });
      }
    }
  });

export const handbookSectionSchema = z.object({
  title: z.string().trim().min(1, "Every section needs a title.").max(80),
  body: z.string().trim().max(4000),
});

/** Ordered list of handbook sections; empty is allowed (a lab may clear it). */
export const handbookSchema = z.array(handbookSectionSchema).max(40);

export const fightRuleSchema = z.object({
  enabled: z.boolean().default(true),
  title: z.string().trim().min(1).max(60),
  blurb: z.string().trim().max(200).default(""),
});

/**
 * Permissive record → exhaustive map: missing/unknown rule keys self-heal to
 * defaults, so settings saved before a new fight rule shipped keep working.
 */
export const fightRulesSchema = z
  .record(z.string(), fightRuleSchema)
  .transform(
    (r) =>
      Object.fromEntries(
        FIGHT_TYPES.map((t) => [t, r[t] ?? structuredClone(DEFAULT_FIGHT_SECTIONS[t])])
      ) as Record<FightType, FightRuleConfig>
  );

export const fightSectionOrderSchema = z
  .array(z.enum(FIGHT_TYPES))
  .transform((order) => [
    ...new Set<FightType>([...order, ...DEFAULT_SECTION_ORDER]),
  ]);

/** Permissive record → exhaustive map: new metrics self-heal to defaults. */
export const performanceWeightsSchema = z
  .record(z.string(), z.coerce.number().min(-100).max(100))
  .transform(
    (r) =>
      Object.fromEntries(
        PERFORMANCE_METRICS.map((m) => [m, r[m] ?? DEFAULT_PERFORMANCE_WEIGHTS[m]])
      ) as Record<PerformanceMetric, number>
  );

export const performanceSettingsSchema = z.object({
  windowDays: z.coerce.number().int().min(7).max(365).default(90),
  updatesCapPerProjectPerWeek: z.coerce.number().int().min(0).max(50).default(3),
  weights: performanceWeightsSchema
    .catch(() => ({ ...DEFAULT_PERFORMANCE_WEIGHTS }))
    .default(() => ({ ...DEFAULT_PERFORMANCE_WEIGHTS })),
});
export type PerformanceSettings = z.infer<typeof performanceSettingsSchema>;

export const labSettingsSchema = z.object({
  labName: z.string().trim().min(1).max(40).default("Mebar"),
  tagline: z
    .string()
    .trim()
    .max(120)
    .default("A board that gets angry when things sit still."),
  defaultTheme: z.enum(["dark", "light"]).default("dark"),
  visibilityMode: z.enum(["RESTRICTED", "OPEN"]).default("RESTRICTED"),
  // The weekly digest email — the admin kill switch; each user can also
  // opt out individually (user.digestOptOut).
  digestEnabled: z.boolean().default(true),
  // Idempotency marker: ISO timestamp of the last digest batch. A re-fired
  // cron inside the guard window is a no-op instead of a duplicate send.
  digestLastSentAt: z.string().default(""),
  // The lab handbook — admin-edited sections everyone can read at /handbook.
  handbook: handbookSchema
    .catch(() => structuredClone(DEFAULT_HANDBOOK))
    .default(() => structuredClone(DEFAULT_HANDBOOK)),
  thresholds: thresholdSettingsSchema.default(() => thresholdSettingsSchema.parse({})),
  permissions: permissionMatrixSchema.default(() => permissionMatrixSchema.parse({})),
  workflow: workflowSchema
    .catch(() => structuredClone(DEFAULT_WORKFLOW))
    .default(() => structuredClone(DEFAULT_WORKFLOW)),
  causeTags: causeTagListSchema
    .catch(() => structuredClone(DEFAULT_CAUSE_TAGS))
    .default(() => structuredClone(DEFAULT_CAUSE_TAGS)),
  serverTypes: serverTypeListSchema
    .catch(() => structuredClone(DEFAULT_SERVER_TYPES))
    .default(() => structuredClone(DEFAULT_SERVER_TYPES)),
  practices: practiceListSchema
    .catch(() => structuredClone(DEFAULT_PRACTICES))
    .default(() => structuredClone(DEFAULT_PRACTICES)),
  proposalQuestions: proposalQuestionListSchema
    .catch(() => structuredClone(DEFAULT_PROPOSAL_QUESTIONS))
    .default(() => structuredClone(DEFAULT_PROPOSAL_QUESTIONS)),
  fightRules: fightRulesSchema
    .catch(() => structuredClone(DEFAULT_FIGHT_SECTIONS))
    .default(() => structuredClone(DEFAULT_FIGHT_SECTIONS)),
  fightSectionOrder: fightSectionOrderSchema
    .catch(() => [...DEFAULT_SECTION_ORDER])
    .default(() => [...DEFAULT_SECTION_ORDER]),
  performance: performanceSettingsSchema
    .catch(() => performanceSettingsSchema.parse({}))
    .default(() => performanceSettingsSchema.parse({})),
});
export type LabSettings = z.infer<typeof labSettingsSchema>;
