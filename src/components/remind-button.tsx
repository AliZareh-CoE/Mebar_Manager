"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { sendReminder } from "@/actions/reminders";
import { Button } from "@/components/ui/button";

/**
 * One-click reminder email. Rendered only for leadership; the server action
 * re-checks. No dialog on purpose — see it, nudge it, move on.
 */
export function RemindButton({
  toUserId,
  recipientName,
  about,
  due,
}: {
  toUserId: string;
  recipientName: string;
  about: string;
  due?: string;
}) {
  const [pending, setPending] = useState(false);

  async function nudge() {
    setPending(true);
    const form = new FormData();
    form.set("toUserId", toUserId);
    form.set("about", about);
    if (due) form.set("due", due);
    const result = await sendReminder(form);
    setPending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Reminder emailed to ${recipientName}.`);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={nudge}
      title={`Email ${recipientName} a reminder about this`}
    >
      <BellRing className="size-3.5" />
      Remind
    </Button>
  );
}
