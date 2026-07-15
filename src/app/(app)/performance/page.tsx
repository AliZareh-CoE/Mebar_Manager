import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { isLabLeadership } from "@/lib/policy";
import { loadPerformanceInput } from "@/lib/performance-data";
import { computeScores } from "@/lib/performance";
import { MetricBreakdown } from "@/components/metric-breakdown";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  // Leadership-only: managers and the compute coordinator.
  if (!isLabLeadership(me)) redirect("/");

  const settings = await getSettings();
  const now = new Date();
  const scores = computeScores(
    await loadPerformanceInput(settings, now),
    {
      weights: settings.performance.weights,
      windowDays: settings.performance.windowDays,
      updatesCapPerProjectPerWeek: settings.performance.updatesCapPerProjectPerWeek,
      decisionTimeoutHours: settings.thresholds.decisionTimeoutHours,
    },
    now
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
        <p className="text-sm text-muted-foreground">
          Last {settings.performance.windowDays} days, computed from the
          record — nobody grades anybody, and nobody is exempt. Weights are
          tunable in Settings → Performance. Click a name for the breakdown.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Standings</CardTitle>
          <CardDescription>
            Delivery (closing things) + Discipline (weekly rhythm minus what
            rots on you) + Initiative-taking (starting fights).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          <div className="grid grid-cols-[2rem_1fr_repeat(4,4.5rem)] items-center gap-2 border-b pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>#</span>
            <span>Person</span>
            <span className="text-right">Delivery</span>
            <span className="text-right">Discipline</span>
            <span className="text-right">Initiative</span>
            <span className="text-right">Total</span>
          </div>
          {scores.map((s, index) => (
            <details key={s.person.id} className="group border-b last:border-b-0">
              <summary className="grid cursor-pointer list-none grid-cols-[2rem_1fr_repeat(4,4.5rem)] items-center gap-2 py-2.5 text-sm hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <span className="tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="flex flex-wrap items-center gap-1.5 font-medium">
                  {s.person.name}
                  {s.person.role === "MANAGER" && <Badge variant="default">Manager</Badge>}
                  {s.person.role === "SECRETARY" && (
                    <Badge variant="secondary">Secretary</Badge>
                  )}
                  {s.person.isComputeCoordinator && (
                    <Badge variant="outline" className="text-emerald-500">
                      Coordinator
                    </Badge>
                  )}
                  {s.person.isDataAnalyst && (
                    <Badge variant="outline" className="text-blue-600 dark:text-blue-400">
                      Analyst
                    </Badge>
                  )}
                </span>
                <span className="text-right tabular-nums">{s.perCategory.DELIVERY}</span>
                <span
                  className={
                    s.perCategory.DISCIPLINE < 0
                      ? "text-right tabular-nums text-red-600 dark:text-red-400"
                      : "text-right tabular-nums"
                  }
                >
                  {s.perCategory.DISCIPLINE}
                </span>
                <span className="text-right tabular-nums">{s.perCategory.INITIATIVE}</span>
                <span className="text-right font-semibold tabular-nums">{s.total}</span>
              </summary>
              <div className="px-8 pb-4 pt-1">
                <MetricBreakdown
                  perMetric={s.perMetric}
                  weights={settings.performance.weights}
                />
              </div>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
