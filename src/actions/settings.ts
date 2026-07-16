"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { labSettings } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";
import {
  getSettings,
  labSettingsSchema,
  thresholdSettingsSchema,
} from "@/lib/settings";
import {
  causeTagListSchema,
  fightRuleSchema,
  handbookSchema,
  performanceSettingsSchema,
  practiceListSchema,
  proposalQuestionListSchema,
  serverTypeListSchema,
} from "@/lib/settings-schema";
import { HEILMEIER_COLUMNS } from "@/lib/proposal";
import { FIGHT_TYPES } from "@/lib/fight-types";
import { PERFORMANCE_METRICS } from "@/lib/performance-metrics";
import { permissionMatrixSchema, CONFIGURABLE_CAPABILITIES } from "@/lib/policy";
import { workflowSchema } from "@/lib/workflow";
import type { ActionResult } from "@/lib/action-utils";
import type { SessionUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

async function patchSettings(patch: Record<string, unknown>): Promise<ActionResult> {
  const current = await getSettings();
  const parsed = labSettingsSchema.safeParse({ ...current, ...patch });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(".")}: ${issue.message}` };
  }

  await db
    .insert(labSettings)
    .values({ id: 1, data: parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: labSettings.id,
      set: { data: parsed.data, updatedAt: new Date() },
    });

  // Settings feed the root layout (theme, lab name) and every page.
  revalidatePath("/", "layout");
  return {};
}

/** Patch + audit: one `settings.<slice>` row per successful save. */
async function patchAndLog(
  me: SessionUser,
  slice: string,
  patch: Record<string, unknown>
): Promise<ActionResult> {
  const res = await patchSettings(patch);
  if (!res.error) {
    void logAudit(me.id, `settings.${slice}`, "settings", slice, `Saved ${slice} settings`);
  }
  return res;
}

export async function updateLabIdentity(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const schema = z.object({
    labName: z.string().trim().min(1, "The lab needs a name").max(40),
    tagline: z.string().trim().max(120).default(""),
    defaultTheme: z.enum(["dark", "light"]),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchAndLog(me, "identity", parsed.data);
}

export async function updateFightRules(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  // One ordered array carries both the per-rule config and the section order.
  const itemSchema = fightRuleSchema.extend({ type: z.enum(FIGHT_TYPES) });
  const parsed = z
    .array(itemSchema)
    .safeParse(parseJsonField(formData, "items"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const fightRules = Object.fromEntries(
    parsed.data.map(({ type, ...rule }) => [type, rule])
  );
  const fightSectionOrder = parsed.data.map((i) => i.type);
  return patchAndLog(me, "fights", { fightRules, fightSectionOrder });
}

export async function updateThresholds(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = thresholdSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(".")}: ${issue.message}` };
  }
  return patchAndLog(me, "thresholds", { thresholds: parsed.data });
}

export async function updateVisibility(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = z
    .object({ visibilityMode: z.enum(["RESTRICTED", "OPEN"]) })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Invalid visibility mode." };
  return patchAndLog(me, "visibility", parsed.data);
}

export async function updateHandbook(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = handbookSchema.safeParse(parseJsonField(formData, "items"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchAndLog(me, "handbook", { handbook: parsed.data });
}

export async function updateDigest(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = z
    .object({ digestEnabled: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Invalid digest setting." };
  return patchAndLog(me, "digest", { digestEnabled: parsed.data.digestEnabled === "true" });
}

export async function updateWorkflow(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("workflow") ?? ""));
  } catch {
    return { error: "Malformed workflow payload." };
  }
  const parsed = workflowSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchAndLog(me, "workflow", { workflow: parsed.data });
}

function parseJsonField(formData: FormData, field: string): unknown {
  try {
    return JSON.parse(String(formData.get(field) ?? ""));
  } catch {
    return undefined;
  }
}

export async function updateCauseTags(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = causeTagListSchema.safeParse(parseJsonField(formData, "items"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchAndLog(me, "causeTags", { causeTags: parsed.data });
}

export async function updatePractices(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = practiceListSchema.safeParse(parseJsonField(formData, "items"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchAndLog(me, "practices", { practices: parsed.data });
}

export async function updateServerTypes(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = serverTypeListSchema.safeParse(parseJsonField(formData, "items"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Cross-slice check: mandatory practices must reference existing practices.
  const settings = await getSettings();
  const practiceKeys = new Set(settings.practices.map((p) => p.key));
  for (const st of parsed.data) {
    const ghost = st.mandatoryPractices.find((p) => !practiceKeys.has(p));
    if (ghost) {
      return { error: `"${st.label}" requires unknown practice "${ghost}".` };
    }
  }
  return patchAndLog(me, "serverTypes", { serverTypes: parsed.data });
}

export async function updateProposalQuestions(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const raw = parseJsonField(formData, "items");
  // The editor doesn't carry the builtin flag — re-derive it from the key so
  // a crafted payload can't flip a built-in to custom (or vice versa).
  const withBuiltin = Array.isArray(raw)
    ? raw.map((item) => ({
        ...(typeof item === "object" && item !== null ? item : {}),
        builtin: (HEILMEIER_COLUMNS as readonly string[]).includes(
          (item as { key?: string })?.key ?? ""
        ),
      }))
    : raw;
  const parsed = proposalQuestionListSchema.safeParse(withBuiltin);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchAndLog(me, "proposalQuestions", { proposalQuestions: parsed.data });
}

export async function updatePerformanceSettings(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = performanceSettingsSchema.safeParse({
    windowDays: formData.get("windowDays"),
    updatesCapPerProjectPerWeek: formData.get("updatesCapPerProjectPerWeek"),
    weights: Object.fromEntries(PERFORMANCE_METRICS.map((m) => [m, formData.get(m)])),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(".")}: ${issue.message}` };
  }
  return patchAndLog(me, "performance", { performance: parsed.data });
}

export async function updatePermissions(formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const raw = Object.fromEntries(
    CONFIGURABLE_CAPABILITIES.map((c) => [c, formData.get(c)])
  );
  const parsed = permissionMatrixSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid permission matrix." };
  return patchAndLog(me, "permissions", { permissions: parsed.data });
}
