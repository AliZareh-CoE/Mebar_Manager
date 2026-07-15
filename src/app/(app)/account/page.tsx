import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds, visibleTaskIds } from "@/lib/visibility";
import { loadLabSnapshot } from "@/lib/fight-data";
import { computeFightList } from "@/lib/fight-engine";
import { activationStateKeys, engineStateFlags } from "@/lib/workflow";
import { isLabLeadership } from "@/lib/policy";
import { loadPerformanceInput } from "@/lib/performance-data";
import { computeScores } from "@/lib/performance";
import { MetricBreakdown } from "@/components/metric-breakdown";
import { ChangeNameForm, ChangePasswordForm } from "@/components/forms/account-forms";
import { FightItemCard } from "@/components/fight-item-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const settings = await getSettings();
  const workflow = settings.workflow;
  const visibleIds = await visibleProjectIds(me, settings);
  const taskIds = await visibleTaskIds(me, settings);
  // Parity with the layout/fight-list call: custom workflow flags, rule
  // toggles, server-type labels, task + initiative scoping all apply here too.
  const myFights = computeFightList(
    await loadLabSnapshot(
      visibleIds,
      activationStateKeys(workflow),
      Object.fromEntries(settings.serverTypes.map((s) => [s.key, s.label])),
      taskIds,
      isLabLeadership(me),
      // Parity with the fight list, or engineers lose their own underload
      // item from "Your fights".
      isLabLeadership(me) ? "ALL" : me.role === "ENGINEER" ? { selfId: me.id } : "NONE"
    ),
    new Date(),
    settings.thresholds,
    {
      stateFlags: engineStateFlags(workflow),
      enabledRules: Object.fromEntries(
        Object.entries(settings.fightRules).map(([type, rule]) => [type, rule.enabled])
      ),
    }
  ).filter((item) => item.responsible?.id === me.id);

  const now = new Date();
  const myScore = computeScores(
    await loadPerformanceInput(settings, now),
    {
      weights: settings.performance.weights,
      windowDays: settings.performance.windowDays,
      updatesCapPerProjectPerWeek: settings.performance.updatesCapPerProjectPerWeek,
      decisionTimeoutHours: settings.thresholds.decisionTimeoutHours,
    },
    now
  ).find((s) => s.person.id === me.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{me.name}</h1>
        <Badge variant={me.role === "MANAGER" ? "default" : "secondary"}>
          {me.role === "MANAGER"
            ? "Manager"
            : me.role === "SECRETARY"
              ? "Secretary"
              : "Engineer"}
        </Badge>
        {me.isDataAnalyst && (
          <Badge variant="outline" className="text-blue-600 dark:text-blue-400">
            Data analyst
          </Badge>
        )}
        {me.isComputeCoordinator && (
          <Badge variant="outline" className="text-emerald-500">
            Compute coordinator
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">{me.email}</span>
      </div>

      {myFights.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="font-medium">Your fights ({myFights.length})</h2>
            <p className="text-xs text-muted-foreground">
              Everything currently yelling at you, oldest and reddest first.
            </p>
          </div>
          {myFights.map((item) => (
            <FightItemCard key={`${item.type}-${item.entityId}`} item={item} />
          ))}
        </div>
      )}

      {myScore && (
        <Card>
          <CardHeader>
            <CardTitle>
              Your score (last {settings.performance.windowDays} days):{" "}
              <span className="tabular-nums">{myScore.total}</span>
            </CardTitle>
            <CardDescription>
              Computed from the record — delivery, discipline, and
              initiative-taking. Same formula for everyone, managers included.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetricBreakdown
              perMetric={myScore.perMetric}
              weights={settings.performance.weights}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangeNameForm currentName={me.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changing it signs out your other sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
