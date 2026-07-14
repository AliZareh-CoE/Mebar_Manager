"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function UserActiveToggle({
  userId,
  banned,
}: {
  userId: string;
  banned: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const { error } = banned
      ? await authClient.admin.unbanUser({ userId })
      : await authClient.admin.banUser({ userId });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Something went wrong.");
      return;
    }
    // Banning also revokes their sessions.
    if (!banned) await authClient.admin.revokeUserSessions({ userId });
    toast.success(banned ? "Account reactivated." : "Account deactivated.");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
      {banned ? "Reactivate" : "Deactivate"}
    </Button>
  );
}
