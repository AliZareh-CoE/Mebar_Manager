import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { loadLabSnapshot } from "@/lib/fight-data";
import { computeFightList } from "@/lib/fight-engine";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const fightCount = computeFightList(await loadLabSnapshot(), new Date()).length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 font-semibold tracking-tight"
          >
            <Flame className="size-5 text-red-500" />
            Mebar
          </Link>
          <NavLinks isManager={user.role === "MANAGER"} fightCount={fightCount} />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.name}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
