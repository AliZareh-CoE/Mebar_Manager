import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { labSettings } from "@/lib/db/schema";
import { labSettingsSchema, type LabSettings } from "@/lib/settings-schema";

export {
  labSettingsSchema,
  thresholdSettingsSchema,
  type LabSettings,
  type ThresholdSettings,
} from "@/lib/settings-schema";

export const getSettings = cache(async (): Promise<LabSettings> => {
  let row: { data: unknown } | undefined;
  try {
    row = await db.select().from(labSettings).where(eq(labSettings.id, 1)).get();
  } catch {
    // No settings table yet — `next build` prerendering before the schema
    // exists (Docker image build), or a first boot before db:push. Stock
    // defaults are the correct answer in both cases.
    row = undefined;
  }
  const parsed = labSettingsSchema.safeParse(row?.data ?? {});
  return parsed.success ? parsed.data : labSettingsSchema.parse({});
});
