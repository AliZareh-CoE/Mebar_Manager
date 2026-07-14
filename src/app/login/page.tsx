import { LoginForm } from "@/components/forms/login-form";
import { Flame } from "lucide-react";

export default function LoginPage() {
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
