"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { isLabLeadership } from "@/lib/policy";
import { smtpConfigured, sendDigestEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionResult } from "@/lib/action-utils";

const reminderSchema = z.object({
  toUserId: z.string().min(1),
  /** What the nudge is about — composed by our own UI from the record. */
  about: z.string().trim().min(1).max(300),
  /** Optional human-readable deadline line ("due Aug 3"). */
  due: z.string().trim().max(80).optional(),
});

/**
 * One-click nudge: leadership emails a lab member about a specific item.
 * The template names the sender — this is a person reminding a person, the
 * app just carries it. Every send lands in the audit log.
 */
export async function sendReminder(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  if (!isLabLeadership(me)) {
    return { error: "Only coordinators and managers can send reminders." };
  }
  if (!smtpConfigured) {
    return { error: "Email isn't configured on this server." };
  }

  const parsed = parseForm(reminderSchema, formData);
  if (!parsed.success) return { error: parsed.error };
  const { toUserId, about, due } = parsed.data;

  const recipient = await db
    .select({ id: user.id, name: user.name, email: user.email, banned: user.banned })
    .from(user)
    .where(eq(user.id, toUserId))
    .get();
  if (!recipient || recipient.banned) return { error: "Recipient not found." };

  const subject = `Reminder: ${about.length > 80 ? about.slice(0, 77) + "…" : about}`;
  const text = [
    `${me.name} sent you a reminder about:`,
    "",
    `  ${about}`,
    ...(due ? ["", `  ${due}`] : []),
    "",
    "The details are in Mebar Manager.",
    "",
    `— sent by ${me.name} via Mebar Manager`,
  ].join("\n");

  try {
    await sendDigestEmail(recipient.email, subject, text);
  } catch {
    return { error: "The email couldn't be sent — check the SMTP settings." };
  }

  void logAudit(
    me.id,
    "reminder.sent",
    "user",
    toUserId,
    `reminded ${recipient.name}: ${about.slice(0, 120)}`,
    { about, due: due ?? null }
  );
  return {};
}
