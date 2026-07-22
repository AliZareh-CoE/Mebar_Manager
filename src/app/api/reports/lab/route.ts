import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { isLabLeadership } from "@/lib/policy";
import { getSettings } from "@/lib/settings";
import { loadStatsInput } from "@/lib/stats-data";
import { computeStats } from "@/lib/stats";
import { buildLabReportDocx } from "@/lib/report-docx";

export const dynamic = "force-dynamic";

/** Whole-lab Word report — leadership only (counts, contributions, UTF). */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (!isLabLeadership(me)) return new Response("Forbidden", { status: 403 });

  const settings = await getSettings();
  const now = new Date();
  const stats = computeStats(await loadStatsInput(), settings.workflow.states, now);
  const buffer = await buildLabReportDocx(stats, settings.labName, now);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="mebar-lab-report-${format(now, "yyyy-MM-dd")}.docx"`,
    },
  });
}
