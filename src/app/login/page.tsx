import { redirect } from "next/navigation";
import { Flame } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "@/components/forms/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // A *valid* session skips the login page. A stale/invalid cookie falls
  // through and renders the form so the user can re-authenticate.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Flame className="size-7 text-red-500" />
          Mebar Manager
        </div>
        <p className="text-sm text-muted-foreground">
          A board that gets angry when things sit still.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
