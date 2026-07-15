"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-utils";

/** Inline settings section form: submit → toast → refresh. */
export function SettingsForm({
  action,
  submitLabel = "Save",
  successMessage = "Settings saved.",
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel?: string;
  successMessage?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await action(new FormData(event.currentTarget));
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(successMessage);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {children}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
