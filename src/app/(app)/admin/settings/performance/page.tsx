import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { updatePerformanceSettings } from "@/actions/settings";
import {
  CATEGORY_LABELS,
  METRIC_CATEGORY,
  METRIC_LABELS,
  PERFORMANCE_CATEGORIES,
  PERFORMANCE_METRICS,
} from "@/lib/performance-metrics";
import { SettingsForm } from "@/components/forms/settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPerformancePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "MANAGER") redirect("/");

  const settings = await getSettings();
  const perf = settings.performance;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Performance scoring</CardTitle>
          <CardDescription>
            Scores are computed from the record — nobody grades anybody, and
            nobody is exempt. Points per counted event; negative weights
            penalize. Every count is visible on the breakdowns, which is the
            real anti-gaming measure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            action={updatePerformanceSettings}
            successMessage="Performance settings saved. Scores recalculate immediately."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="windowDays">Rolling window (days)</Label>
                <Input
                  id="windowDays"
                  name="windowDays"
                  type="number"
                  min={7}
                  max={365}
                  defaultValue={perf.windowDays}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Only events inside this window count.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="updatesCapPerProjectPerWeek">
                  Update credit cap (per project per week)
                </Label>
                <Input
                  id="updatesCapPerProjectPerWeek"
                  name="updatesCapPerProjectPerWeek"
                  type="number"
                  min={0}
                  max={50}
                  defaultValue={perf.updatesCapPerProjectPerWeek}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Anti-spam: extra updates beyond this earn nothing. 0 disables
                  update credit.
                </p>
              </div>
            </div>

            {PERFORMANCE_CATEGORIES.map((category) => (
              <div key={category} className="flex flex-col gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[category]}
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {PERFORMANCE_METRICS.filter((m) => METRIC_CATEGORY[m] === category).map(
                    (metric) => (
                      <div key={metric} className="flex flex-col gap-1.5">
                        <Label htmlFor={metric} className="text-xs">
                          {METRIC_LABELS[metric]}
                        </Label>
                        <Input
                          id={metric}
                          name={metric}
                          type="number"
                          step="0.5"
                          defaultValue={perf.weights[metric]}
                          required
                        />
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </SettingsForm>
        </CardContent>
      </Card>
    </div>
  );
}
