"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/lib/action-utils";

/** Stamp the caller's onboardedAt. Only fills a null value (idempotent).
 * Self-only — onboarding is the user acknowledging for themselves. */
export async function acknowledgeOnboarding(): Promise<ActionResult> {
  const me = await requireUser();
  await db
    .update(user)
    .set({ onboardedAt: new Date() })
    .where(and(eq(user.id, me.id), isNull(user.onboardedAt)));
  // Clears the Fight List banner and the People "Onboarding pending" badge.
  revalidatePath("/", "layout");
  revalidatePath("/welcome");
  revalidatePath("/admin/users");
  return {};
}
