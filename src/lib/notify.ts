import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, projectPeople } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { smtpConfigured, sendWatcherEmail } from "@/lib/email";
import { resolveRecipients } from "@/lib/notify-recipients";

/**
 * Big-event project notifications for the people on the lineup who opted
 * in — mostly people outside the app (external PIs, students). Fire and
 * forget: `void notifyProjectEvent(...)` AFTER the mutation commits. A
 * failed or unconfigured send never blocks or fails the action — the app
 * is the record, email is a courtesy.
 *
 * Big events only (deliberate): state changes, milestones completed,
 * paper status changes. Not updates/blockers/decisions — noise for
 * outsiders.
 */
export async function notifyProjectEvent(
  projectId: string,
  event: { title: string; lines?: string[] }
): Promise<void> {
  try {
    if (!smtpConfigured) return;
    const [project, lineup, settings] = await Promise.all([
      db
        .select({ title: projects.title })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get(),
      db.query.projectPeople.findMany({
        where: eq(projectPeople.projectId, projectId),
        with: { user: { columns: { email: true } } },
      }),
      getSettings(),
    ]);
    if (!project) return;

    const recipients = resolveRecipients(
      lineup.map((pp) => ({ notify: pp.notify, email: pp.email, userEmail: pp.user?.email ?? null }))
    );
    if (recipients.length === 0) return;

    const base = process.env.BETTER_AUTH_URL ?? "";
    const link = base ? `\n\nFollow along: ${base}/projects/${projectId}` : "";
    await sendWatcherEmail(
      recipients,
      `[${settings.labName}] ${project.title} — ${event.title}`,
      `${event.title} on "${project.title}".\n${(event.lines ?? []).join("\n")}${link}\n\n— ${settings.labName} Manager (automated project notification)`
    );
  } catch (error) {
    console.error("[notify] project event email failed:", error);
  }
}
