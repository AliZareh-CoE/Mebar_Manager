import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** The lab's own words on how it works — readable by every role. */
export default async function HandbookPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const settings = await getSettings();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {`${settings.labName} handbook`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How the lab works, in the lab&apos;s own words. New here? Start with
          the checklist on your{" "}
          <a href="/welcome" className="underline underline-offset-4">
            welcome page
          </a>
          .
        </p>
      </div>

      {settings.handbook.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            The handbook is empty. An admin can add sections under Settings →
            Handbook.
          </CardContent>
        </Card>
      ) : (
        settings.handbook.map((section, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
              {section.body}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
