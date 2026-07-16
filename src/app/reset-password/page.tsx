import Link from "next/link";
import { MebarMark } from "@/components/mebar-mark";
import { getSettings } from "@/lib/settings";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const settings = await getSettings();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <MebarMark className="size-7" />
        {settings.labName}
      </div>
      {error || !token ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Reset link invalid</CardTitle>
            <CardDescription>
              This reset link is invalid or has expired (they last one hour).
              Request a fresh one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password" className="text-sm underline underline-offset-4">
              Request a new link
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </main>
  );
}
