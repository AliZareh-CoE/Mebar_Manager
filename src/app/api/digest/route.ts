import { NextResponse, type NextRequest } from "next/server";
import { differenceInCalendarDays } from "date-fns";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { smtpConfigured, sendDigestEmail } from "@/lib/email";
import { loadLabSnapshot } from "@/lib/fight-data";
import { computeFightList, projectAgeDays } from "@/lib/fight-engine";
import { activationStateKeys, engineStateFlags } from "@/lib/workflow";
import { buildDigest, type DigestDueItem } from "@/lib/digest";

/**
 * Weekly digest sender. Emails each active, non-opted-out user their own
 * fights, what's due in the coming week, and their projects' age pills.
 *
 * Guarded by CRON_SECRET (bearer token) — fails closed when unset. Excluded
 * from the session-cookie middleware for exactly this path. No-op unless
 * SMTP is configured AND settings.digestEnabled is on, so scheduling it
 * unconditionally is safe.
 *
 * Install (crontab of the deploy user) — Monday 08:00:
 *   0 8 * * 1 docker compose -f /opt/mebar-manager/deploy/docker-compose.yml exec -T app \
 *     node -e "fetch('http://localhost:3000/api/digest',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)" \
 *     >> /var/log/mebar-digest.log 2>&1
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getSettings();
  if (!smtpConfigured || !settings.digestEnabled) {
    return NextResponse.json({
      sent: 0,
      skipped: !smtpConfigured ? "SMTP not configured" : "digestEnabled is off",
    });
  }

  const now = new Date();
  const workflow = settings.workflow;
  const flags = engineStateFlags(workflow);
  const frozen = (state: string) => flags[state]?.frozen ?? false;

  // One full-scope snapshot; each person's digest is scoped by filtering
  // on responsibility/involvement below.
  const snap = await loadLabSnapshot(
    null,
    activationStateKeys(workflow),
    Object.fromEntries(settings.serverTypes.map((s) => [s.key, s.label])),
    null,
    true,
    "ALL",
    true
  );
  const fights = computeFightList(snap, now, settings.thresholds, {
    stateFlags: flags,
    enabledRules: Object.fromEntries(
      Object.entries(settings.fightRules).map(([type, rule]) => [type, rule.enabled])
    ),
  });

  const people = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      digestOptOut: user.digestOptOut,
      banned: user.banned,
    })
    .from(user);

  const projectById = new Map(snap.projects.map((p) => [p.id, p]));
  const inWeek = (d: Date) =>
    differenceInCalendarDays(d, now) >= 0 && differenceInCalendarDays(d, now) <= 7;

  let sent = 0;
  const failures: string[] = [];
  for (const p of people) {
    if (p.banned || p.digestOptOut) continue;

    const personFights = fights.filter((f) => f.responsible?.id === p.id);

    // Age pills: their live (non-frozen) projects as owner or advisor.
    const projects = snap.projects
      .filter((pr) => (pr.owner.id === p.id || pr.advisor.id === p.id) && !frozen(pr.state))
      .map((pr) => ({ id: pr.id, title: pr.title, ageDays: projectAgeDays(pr, now) }))
      .sort((a, b) => b.ageDays - a.ageDays);

    // Due this week — derived entirely from the snapshot (no extra queries).
    const dueThisWeek: DigestDueItem[] = [];
    for (const m of snap.openMilestones) {
      const pr = projectById.get(m.projectId);
      if (!pr || frozen(pr.state)) continue;
      if (pr.owner.id !== p.id && pr.advisor.id !== p.id) continue;
      if (m.status === "DONE" || m.status === "CANCELLED") continue;
      if (inWeek(m.dueDate))
        dueThisWeek.push({ kind: "milestone", title: m.title, projectTitle: pr.title, due: m.dueDate });
    }
    for (const tk of snap.openTasks ?? []) {
      if (tk.status !== "OPEN") continue;
      if (tk.assigneeId !== p.id && tk.requester.id !== p.id) continue;
      if (inWeek(tk.deadline))
        dueThisWeek.push({
          kind: "task",
          title: tk.title,
          projectTitle: tk.projectId ? (projectById.get(tk.projectId)?.title ?? null) : null,
          due: tk.deadline,
        });
    }
    for (const dr of snap.openDataRequests) {
      if (dr.status === "DELIVERED" || dr.status === "CANCELLED") continue;
      if (dr.assigneeId !== p.id && dr.requester?.id !== p.id) continue;
      if (inWeek(dr.neededBy))
        dueThisWeek.push({
          kind: "dataRequest",
          title: dr.title,
          projectTitle: dr.projectId ? (projectById.get(dr.projectId)?.title ?? null) : null,
          due: dr.neededBy,
        });
    }
    // Paper targets: DRAFTING papers on the person's own/advised projects
    // whose submission target lands this week.
    for (const pp of snap.papers ?? []) {
      if (pp.status !== "DRAFTING" || !pp.targetSubmissionAt) continue;
      const pr = projectById.get(pp.projectId);
      if (!pr || frozen(pr.state)) continue;
      if (pr.owner.id !== p.id && pr.advisor.id !== p.id) continue;
      if (inWeek(pp.targetSubmissionAt))
        dueThisWeek.push({
          kind: "paperTarget",
          title: pp.title ?? "Draft paper",
          projectTitle: pr.title,
          due: pp.targetSubmissionAt,
        });
    }

    // Nothing yelling, nothing due, no live projects → no email.
    if (personFights.length === 0 && dueThisWeek.length === 0 && projects.length === 0) continue;

    const digest = buildDigest(
      { id: p.id, name: p.name, email: p.email },
      { fights, dueThisWeek, projects },
      settings,
      now
    );
    try {
      // Awaited (not fire-and-forget): the batch must flush every send
      // before responding.
      await sendDigestEmail(p.email, digest.subject, digest.text);
      sent++;
    } catch (e) {
      console.error(`digest: send failed for ${p.email}:`, e);
      failures.push(p.email);
    }
  }

  return NextResponse.json({ sent, ...(failures.length ? { failures } : {}) });
}
