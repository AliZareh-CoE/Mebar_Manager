"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setDigestOptOut } from "@/actions/user-flags";

export function DigestOptOutToggle({ initialOptOut }: { initialOptOut: boolean }) {
  const router = useRouter();
  const [optOut, setOptOut] = useState(initialOptOut);
  const [pending, setPending] = useState(false);

  async function onChange(next: boolean) {
    setPending(true);
    setOptOut(next);
    const result = await setDigestOptOut(next);
    setPending(false);
    if (result.error) {
      setOptOut(!next);
      toast.error(result.error);
      return;
    }
    toast.success(next ? "You're off the weekly digest." : "You're on the weekly digest.");
    router.refresh();
  }

  // `checked` = subscribed (NOT opted out) — the state the user reasons about.
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={!optOut}
        disabled={pending}
        onChange={(e) => onChange(!e.target.checked)}
        data-slot="digest-toggle"
      />
      <span>Email me the weekly digest of my fights and what&apos;s due.</span>
    </label>
  );
}
