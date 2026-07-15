import Link from "next/link";
import { Flame } from "lucide-react";
import { smtpConfigured } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const settings = await getSettings();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Flame className="size-7 text-red-500" />
        {settings.labName}
      </div>
      {smtpConfigured ? (
        <ForgotPasswordForm />
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Forgot your password?</CardTitle>
            <CardDescription>
              Email resets aren&apos;t set up for this lab. Ask a coordinator —
              they can set you a temporary password from the People page, and
              you can change it afterwards on your Account page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className="text-sm underline underline-offset-4">
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
