import { z } from "zod";
import { permissionMatrixSchema } from "@/lib/policy";
import { workflowSchema, KEY_RE } from "@/lib/workflow";
import {
  DEFAULT_WORKFLOW,
  DEFAULT_CAUSE_TAGS,
  DEFAULT_SERVER_TYPES,
  DEFAULT_PRACTICES,
  DEFAULT_PROPOSAL_QUESTIONS,
} from "@/lib/settings-defaults";
import { HEILMEIER_COLUMNS } from "@/lib/proposal";
import {
  STALL_DAYS,
  UNOWNED_BLOCKER_DAYS,
  DECISION_TIMEOUT_HOURS,
  DECISION_URGENT_HOURS,
  COMPUTE_PENDING_URGENT_HOURS,
  COMPUTE_RESULTS_URGENT_DAYS,
  AGE_FRESH_DAYS,
  AGE_AGING_DAYS,
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

export const labSettingsSchema = z.object({
  labName: z.string().trim().min(1).max(40).default("Mebar"),
  defaultTheme: z.enum(["dark", "light"]).default("dark"),
  visibilityMode: z.enum(["RESTRICTED", "OPEN"]).default("RESTRICTED"),
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
});
export type LabSettings = z.infer<typeof labSettingsSchema>;
