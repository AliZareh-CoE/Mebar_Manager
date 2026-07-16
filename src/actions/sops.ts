"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { sops } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { parseForm, type ActionResult } from "@/lib/action-utils";

function revalidateSops() {
  revalidatePath("/sops");
}

// The checklist textarea sends one step per line. Trim, drop blanks.
const checklistField = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );

const sopSchema = z.object({
  title: z.string().trim().min(1, "Give the protocol a name."),
  body: z.string().trim().default(""),
  checklist: checklistField,
});

export async function createSop(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("sop.edit")) {
    return { error: "You don't have permission to write protocols." };
  }

  const parsed = parseForm(sopSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  await db.insert(sops).values({
    title: parsed.data.title,
    body: parsed.data.body,
    checklist: parsed.data.checklist,
    createdById: me.id,
    updatedAt: new Date(),
  });

  revalidateSops();
  return {};
}

export async function editSop(sopId: string, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("sop.edit")) {
    return { error: "You don't have permission to edit protocols." };
  }

  const parsed = parseForm(sopSchema, formData);
  if (!parsed.success) return { error: parsed.error };

  const existing = await db.select().from(sops).where(eq(sops.id, sopId)).get();
  if (!existing) return { error: "Protocol not found." };

  await db
    .update(sops)
    .set({
      title: parsed.data.title,
      body: parsed.data.body,
      checklist: parsed.data.checklist,
      updatedAt: new Date(),
    })
    .where(eq(sops.id, sopId));

  revalidateSops();
  return {};
}

/** No hard delete — archived protocols stay for the record. */
export async function archiveSop(sopId: string, archived: boolean): Promise<ActionResult> {
  const me = await requireUser();
  const policy = await getPolicy(me);
  if (!policy.can("sop.edit")) {
    return { error: "You don't have permission to archive protocols." };
  }

  const existing = await db.select().from(sops).where(eq(sops.id, sopId)).get();
  if (!existing) return { error: "Protocol not found." };

  await db
    .update(sops)
    .set({ archived, updatedAt: new Date() })
    .where(eq(sops.id, sopId));

  revalidateSops();
  return {};
}
