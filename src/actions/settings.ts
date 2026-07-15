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
    defaultTheme: z.enum(["dark", "light"]),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return patchSettings(parsed.data);
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

export async function updatePermissions(formData: FormData): Promise<ActionResult> {
  await requireManager();
  const raw = Object.fromEntries(
    CONFIGURABLE_CAPABILITIES.map((c) => [c, formData.get(c)])
  );
  const parsed = permissionMatrixSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid permission matrix." };
  return patchSettings({ permissions: parsed.data });
}
