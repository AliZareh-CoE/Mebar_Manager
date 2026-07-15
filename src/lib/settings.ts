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
  const row = await db.select().from(labSettings).where(eq(labSettings.id, 1)).get();
  const parsed = labSettingsSchema.safeParse(row?.data ?? {});
  return parsed.success ? parsed.data : labSettingsSchema.parse({});
});
