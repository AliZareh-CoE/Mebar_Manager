"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { requireAdmin, requireUser } from "@/lib/session";
import type { ActionResult } from "@/lib/action-utils";

/** Grant or revoke the data-analyst add-on. Manager-only. */
export async function setDataAnalyst(
  userId: string,
  isAnalyst: boolean
): Promise<ActionResult> {
  await requireAdmin();

  const target = await db.select().from(user).where(eq(user.id, userId)).get();
  if (!target) return { error: "User not found." };
  if (target.banned) return { error: "Reactivate the account first." };

  await db.update(user).set({ isDataAnalyst: isAnalyst }).where(eq(user.id, userId));
  revalidatePath("/admin/users");
  revalidatePath("/");
  return {};
}

/**
 * Make a manager THE compute coordinator. Exactly one exists at a time, so
 * setting it clears the previous holder in the same transaction.
 */
export async function setComputeCoordinator(userId: string): Promise<ActionResult> {
  await requireAdmin();

  const target = await db.select().from(user).where(eq(user.id, userId)).get();
  if (!target) return { error: "User not found." };
  if (target.role !== "MANAGER" && target.role !== "ADMIN") {
    return { error: "The compute coordinator must be a coordinator (manager) account." };
  }
  if (target.banned) return { error: "Reactivate the account first." };

  db.transaction((tx) => {
    tx.update(user)
      .set({ isComputeCoordinator: false })
      .where(eq(user.isComputeCoordinator, true))
      .run();
    tx.update(user)
      .set({ isComputeCoordinator: true })
      .where(eq(user.id, userId))
      .run();
  });

  revalidatePath("/admin/users");
  revalidatePath("/");
  revalidatePath("/compute");
  return {};
}

/** Self-service: any signed-in user opts THEIR OWN account in/out of the
 * weekly digest. Never touches another user's row. */
export async function setDigestOptOut(optOut: boolean): Promise<ActionResult> {
  const me = await requireUser();
  await db.update(user).set({ digestOptOut: optOut }).where(eq(user.id, me.id));
  revalidatePath("/account");
  return {};
}
