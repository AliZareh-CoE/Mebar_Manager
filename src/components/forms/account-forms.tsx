"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangeNameForm({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    setPending(true);
    const { error } = await authClient.updateUser({ name });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Couldn't update your name.");
      return;
    }
    toast.success("Name updated.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="acc-name">Display name</Label>
        <Input id="acc-name" name="name" defaultValue={currentName} required />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const newPassword = String(fd.get("newPassword") ?? "");
    if (newPassword !== String(fd.get("confirm") ?? "")) {
      toast.error("New passwords don't match.");
      return;
    }
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(fd.get("currentPassword") ?? ""),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Couldn't change the password.");
      return;
    }
    toast.success("Password changed. Other sessions were signed out.");
    form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="acc-current">Current password</Label>
        <Input id="acc-current" name="currentPassword" type="password" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="acc-new">New password</Label>
          <Input id="acc-new" name="newPassword" type="password" minLength={8} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="acc-confirm">Confirm new password</Label>
          <Input id="acc-confirm" name="confirm" type="password" minLength={8} required />
        </div>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
