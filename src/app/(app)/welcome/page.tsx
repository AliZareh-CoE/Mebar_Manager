import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { WelcomeChecklist } from "@/components/welcome-checklist";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {`Welcome, ${me.name.split(" ")[0]}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A three-step start. Work through it, then acknowledge — the banner on
          your Fight List disappears once you do.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            {me.onboardedAt
              ? "You're already onboarded — this is here as a refresher."
              : "Finish these and you're set up."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WelcomeChecklist />
        </CardContent>
      </Card>
    </div>
  );
}
