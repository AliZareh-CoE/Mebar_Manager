"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acknowledgeOnboarding } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    href: "/handbook",
    label: "Read the lab handbook",
    detail: "How the lab actually runs.",
  },
  {
    href: "/guide",
    label: "Read the guide",
    detail: "Every rule that can put work on your Fight List, and how to win it.",
  },
  {
    href: "/account",
    label: "Change your password",
    detail: "Swap the temporary password you were given for one only you know.",
  },
];

export function WelcomeChecklist() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function acknowledge() {
    setSaving(true);
    const result = await acknowledgeOnboarding();
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Welcome aboard. That banner is gone for good.");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {STEPS.map((step) => (
          <li key={step.href} className="rounded-md border p-3">
            <Link href={step.href} className="font-medium underline-offset-4 hover:underline">
              {step.label}
            </Link>
            <p className="text-sm text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          data-slot="welcome-confirm"
        />
        I&apos;ve read the handbook and the guide.
      </label>
      <Button onClick={acknowledge} disabled={!confirmed || saving} className="self-start">
        {saving ? "Saving…" : "Acknowledge & finish"}
      </Button>
    </div>
  );
}
