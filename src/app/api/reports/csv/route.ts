import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { isLabLeadership } from "@/lib/policy";
import { getSettings } from "@/lib/settings";
import { loadStatsInput } from "@/lib/stats-data";
import { computeStats } from "@/lib/stats";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const ENTITIES = ["projects", "papers", "members", "utf", "blockers", "requests"] as const;
type Entity = (typeof ENTITIES)[number];

/** Raw data exports for Excel — leadership only. ?entity=projects|papers|… */
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (!isLabLeadership(me)) return new Response("Forbidden", { status: 403 });

  const entity = new URL(request.url).searchParams.get("entity") as Entity | null;
  if (!entity || !ENTITIES.includes(entity)) {
    return new Response(`Unknown entity. Use one of: ${ENTITIES.join(", ")}`, { status: 400 });
  }

  const settings = await getSettings();
  const now = new Date();
  const input = await loadStatsInput();
  const stats = computeStats(input, settings.workflow.states, now);
  const stateLabel = (key: string) =>
    settings.workflow.states.find((s) => s.key === key)?.label ?? key;

  let csv: string;
  switch (entity) {
    case "projects":
      csv = toCsv(
        ["Title", "State", "Created"],
        input.projects.map((p) => [p.title, stateLabel(p.state), format(p.createdAt, "yyyy-MM-dd")])
      );
      break;
    case "papers":
      csv = toCsv(
        ["Project", "Status", "Venue", "Submitted", "Accepted"],
        input.papers.map((pp) => [
          pp.projectId,
          pp.status,
          pp.venue ?? "",
          pp.submittedAt ? format(pp.submittedAt, "yyyy-MM-dd") : "",
          pp.acceptedAt ? format(pp.acceptedAt, "yyyy-MM-dd") : "",
        ])
      );
      break;
    case "members":
      csv = toCsv(
        [
          "Name",
          "Role",
          "Running owned",
          "Updates window",
          "Updates all",
          "Milestones done",
          "Papers submitted",
          "Papers accepted",
          "Blockers resolved",
        ],
        stats.members.map((m) => [
          m.name,
          m.role,
          m.runningOwned,
          m.updatesWindow,
          m.updatesAll,
          m.milestonesDone,
          m.papersSubmitted,
          m.papersAccepted,
          m.blockersResolved,
        ])
      );
      break;
    case "utf":
      csv = toCsv(
        ["Student", "Archived", "Projects tagged", "Running", "Done", "Papers submitted", "Papers accepted"],
        stats.utf.map((s) => [
          s.name,
          s.archived ? "yes" : "no",
          s.projectsTagged,
          s.running,
          s.done,
          s.papersSubmitted,
          s.papersAccepted,
        ])
      );
      break;
    case "blockers":
      csv = toCsv(
        ["Cause", "Status", "Created", "Resolved"],
        input.blockers.map((b) => [
          settings.causeTags.find((t) => t.key === b.causeTag)?.label ?? b.causeTag,
          b.status,
          format(b.createdAt, "yyyy-MM-dd"),
          b.resolvedAt ? format(b.resolvedAt, "yyyy-MM-dd") : "",
        ])
      );
      break;
    case "requests":
      csv = toCsv(
        ["Kind", "Status", "Detail"],
        [
          ...input.dataRequests.map((r): [string, string, string] => [
            "data",
            r.status,
            r.externalRequester ? `external: ${r.externalRequester}` : "internal",
          ]),
          ...input.computeRequests.map((r): [string, string, string] => [
            "compute",
            r.status,
            `${r.hoursNeeded}h`,
          ]),
        ]
      );
      break;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mebar-${entity}-${format(now, "yyyy-MM-dd")}.csv"`,
    },
  });
}
