"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    await authClient.requestPasswordReset({
      email: String(formData.get("email") ?? ""),
      redirectTo: "/reset-password",
    });
    setPending(false);
    // Always claim success — don't leak which emails exist.
    setSent(true);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          {sent
            ? "If that address has an account, a reset link is on its way. It expires in an hour."
            : "We'll email you a reset link."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <Link href="/login" className="text-sm underline underline-offset-4">
            Back to sign in
          </Link>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="fp-email">Email</Label>
              <Input id="fp-email" name="email" type="email" required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
