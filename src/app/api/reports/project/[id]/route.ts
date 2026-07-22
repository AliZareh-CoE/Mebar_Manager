import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { canAccessProject, visibleProjectIds, isVisible } from "@/lib/visibility";
import { resolveStateDisplay } from "@/lib/workflow";
import { loadProjectReport } from "@/lib/report-data";
import { buildProjectReportDocx } from "@/lib/report-docx";

export const dynamic = "force-dynamic";

/** Per-project Word report — same visibility surface as the project page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!(await canAccessProject(me, id))) return new Response("Not found", { status: 404 });

  const settings = await getSettings();
  const visibleIds = await visibleProjectIds(me, settings);
  if (!isVisible(visibleIds, id)) return new Response("Not found", { status: 404 });

  const data = await loadProjectReport(id);
  if (!data) return new Response("Not found", { status: 404 });

  const now = new Date();
  const stateLabel = resolveStateDisplay(settings.workflow, data.project.state).label;
  const causeLabels = Object.fromEntries(settings.causeTags.map((t) => [t.key, t.label]));
  const buffer = await buildProjectReportDocx(data, stateLabel, causeLabels, now);
  const slug = data.project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slug}-report-${format(now, "yyyy-MM-dd")}.docx"`,
    },
  });
}
