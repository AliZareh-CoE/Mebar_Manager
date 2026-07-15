"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { labSettings } from "@/lib/db/schema";
import { requireManager } from "@/lib/session";
import {
  getSettings,
  labSettingsSchema,
  thresholdSettingsSchema,
} from "@/lib/settings";
import {
  causeTagListSchema,
  fightRuleSchema,
  practiceListSchema,
  proposalQuestionListSchema,
  serverTypeListSchema,
} from "@/lib/settings-schema";
import { HEILMEIER_COLUMNS } from "@/lib/proposal";
import { FIGHT_TYPES } from "@/lib/fight-types";
import { permissionMatrixSchema, CONFIGURABLE_CAPABILITIES } from "@/lib/policy";
import { workflowSchema } from "@/lib/workflow";
import type { ActionResult } from "@/lib/action-utils";

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

export async function updateLabIdentity(formData: FormData): Promise<ActionResult> {
  await requireManager();
  const schema = z.object({
    labName: z.string().trim().min(1, "The lab needs a name").max(40),
    tagline: z.string().trim().max(120).default(""),
    defaultTheme: z.enum(["dark", "light"]),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchSettings(parsed.data);
}

export async function updateFightRules(formData: FormData): Promise<ActionResult> {
  await requireManager();
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
  return patchSettings({ fightRules, fightSectionOrder });
}

export async function updateThresholds(formData: FormData): Promise<ActionResult> {
  await requireManager();
  const parsed = thresholdSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(".")}: ${issue.message}` };
  }
  return patchSettings({ thresholds: parsed.data });
}

export async function updateVisibility(formData: FormData): Promise<ActionResult> {
  await requireManager();
  const parsed = z
    .object({ visibilityMode: z.enum(["RESTRICTED", "OPEN"]) })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Invalid visibility mode." };
  return patchSettings(parsed.data);
}

export async function updateWorkflow(formData: FormData): Promise<ActionResult> {
  await requireManager();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("workflow") ?? ""));
  } catch {
    return { error: "Malformed workflow payload." };
  }
  const parsed = workflowSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchSettings({ workflow: parsed.data });
}

function parseJsonField(formData: FormData, field: string): unknown {
  try {
    return JSON.parse(String(formData.get(field) ?? ""));
  } catch {
    return undefined;
  }
}

export async function updateCauseTags(formData: FormData): Promise<ActionResult> {
  await requireManager();
  const parsed = causeTagListSchema.safeParse(parseJsonField(formData, "items"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchSettings({ causeTags: parsed.data });
}

export async function updatePractices(formData: FormData): Promise<ActionResult> {
  await requireManager();
  const parsed = practiceListSchema.safeParse(parseJsonField(formData, "items"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchSettings({ practices: parsed.data });
}

export async function updateServerTypes(formData: FormData): Promise<ActionResult> {
  await requireManager();
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
  return patchSettings({ serverTypes: parsed.data });
}

export async function updateProposalQuestions(formData: FormData): Promise<ActionResult> {
  await requireManager();
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
  return patchSettings({ proposalQuestions: parsed.data });
}

export async function updatePermissions(formData: FormData): Promise<ActionResult> {
  await requireManager();
  const raw = Object.fromEntries(
    CONFIGURABLE_CAPABILITIES.map((c) => [c, formData.get(c)])
  );
  const parsed = permissionMatrixSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid permission matrix." };
  return patchSettings({ permissions: parsed.data });
}
