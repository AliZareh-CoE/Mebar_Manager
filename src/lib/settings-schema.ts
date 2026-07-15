import { z } from "zod";
import { permissionMatrixSchema } from "@/lib/policy";
import { workflowSchema } from "@/lib/workflow";
import { DEFAULT_WORKFLOW } from "@/lib/settings-defaults";
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

export const labSettingsSchema = z.object({
  labName: z.string().trim().min(1).max(40).default("Mebar"),
  defaultTheme: z.enum(["dark", "light"]).default("dark"),
  visibilityMode: z.enum(["RESTRICTED", "OPEN"]).default("RESTRICTED"),
  thresholds: thresholdSettingsSchema.default(() => thresholdSettingsSchema.parse({})),
  permissions: permissionMatrixSchema.default(() => permissionMatrixSchema.parse({})),
  workflow: workflowSchema
    .catch(() => structuredClone(DEFAULT_WORKFLOW))
    .default(() => structuredClone(DEFAULT_WORKFLOW)),
});
export type LabSettings = z.infer<typeof labSettingsSchema>;
