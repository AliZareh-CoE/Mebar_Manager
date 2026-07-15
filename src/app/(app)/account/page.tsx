import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { visibleProjectIds } from "@/lib/visibility";
import { loadLabSnapshot } from "@/lib/fight-data";
import { computeFightList } from "@/lib/fight-engine";
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
  const visibleIds = await visibleProjectIds(me, settings);
  const myFights = computeFightList(
    await loadLabSnapshot(visibleIds),
    new Date(),
    settings.thresholds
  ).filter((item) => item.responsible?.id === me.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{me.name}</h1>
        <Badge variant={me.role === "MANAGER" ? "default" : "secondary"}>
          {me.role === "MANAGER" ? "Manager" : "Engineer"}
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
