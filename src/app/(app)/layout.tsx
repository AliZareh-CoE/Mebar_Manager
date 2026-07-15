import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { expireOverdueDecisions } from "@/lib/maintenance";
import { loadLabSnapshot } from "@/lib/fight-data";
import { visibleProjectIds, visibleTaskIds } from "@/lib/visibility";
import { computeFightList } from "@/lib/fight-engine";
import {
  activationStateKeys,
  engineStateFlags,
  frozenStateKeys,
} from "@/lib/workflow";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const settings = await getSettings();
  const workflow = settings.workflow;
  // Expire first so the badge never counts decisions already past the
  // timeout as pending fights.
  expireOverdueDecisions(
    new Date(),
    settings.thresholds.decisionTimeoutHours,
    frozenStateKeys(workflow)
  );
  const visibleIds = await visibleProjectIds(user, settings);
  const taskIds = await visibleTaskIds(user, settings);
  const fightCount = computeFightList(
    await loadLabSnapshot(
      visibleIds,
      activationStateKeys(workflow),
      Object.fromEntries(settings.serverTypes.map((s) => [s.key, s.label])),
      taskIds
    ),
    new Date(),
    settings.thresholds,
    { stateFlags: engineStateFlags(workflow) }
  ).length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 font-semibold tracking-tight"
          >
            <Flame className="size-5 text-red-500" />
            {settings.labName}
          </Link>
          <NavLinks role={user.role} fightCount={fightCount} />
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/account"
              className="hidden text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:inline"
            >
              {user.name}
            </Link>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
