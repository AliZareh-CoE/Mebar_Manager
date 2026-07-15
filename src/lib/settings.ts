import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { labSettings } from "@/lib/db/schema";
import { permissionMatrixSchema } from "@/lib/policy";
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
 * Lab-wide settings, admin-editable at /admin/settings. Everything has a
 * default (the constants in thresholds.ts stay the single source of default
 * numbers), so a missing or corrupt row degrades to stock behavior.
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
});
export type LabSettings = z.infer<typeof labSettingsSchema>;

export const getSettings = cache(async (): Promise<LabSettings> => {
  const row = await db.select().from(labSettings).where(eq(labSettings.id, 1)).get();
  const parsed = labSettingsSchema.safeParse(row?.data ?? {});
  return parsed.success ? parsed.data : labSettingsSchema.parse({});
});
