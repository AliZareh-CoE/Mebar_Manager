"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import {
  setProjectRole,
  removeProjectPerson,
  toggleNotify,
} from "@/actions/project-people";
import { Button } from "@/components/ui/button";

/**
 * Row actions for one lineup entry: promote to PI / first author (the
 * action demotes the previous holder to contributor), toggle notification
 * emails, remove from the lineup.
 */
export function ProjectPersonRowActions({
  projectId,
  personId,
  role,
  userId,
  externalName,
  hasEmail,
  notify,
  rolesLocked,
}: {
  projectId: string;
  personId: string;
  role: "PI" | "FIRST_AUTHOR" | "CONTRIBUTOR" | "UTF_STUDENT";
  userId: string | null;
  externalName: string | null;
  hasEmail: boolean;
  notify: boolean;
  /** Activated projects lock PI/first-author changes to manager rank. */
  rolesLocked: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<{ error?: string } | void>, success: string) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    router.refresh();
  }

  function promote(to: "PI" | "FIRST_AUTHOR") {
    const form = new FormData();
    form.set("role", to);
    if (userId) form.set("userId", userId);
    else form.set("externalName", externalName ?? "");
    return run(
      () => setProjectRole(projectId, form),
      to === "PI" ? "PI set. The previous PI stays as a contributor." : "First author set."
    );
  }

  const canNotify = userId !== null || hasEmail;
  // UTF-student tags are roster references: no promotion into the required
  // roles and no notification bell (the roster is name-only).
  const isUtf = role === "UTF_STUDENT";

  return (
    <div className="flex items-center justify-end gap-2">
      {!rolesLocked && !isUtf && role !== "PI" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => promote("PI")}>
          Make PI
        </Button>
      )}
      {!rolesLocked && !isUtf && role !== "FIRST_AUTHOR" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => promote("FIRST_AUTHOR")}
        >
          Make first author
        </Button>
      )}
      {!isUtf && (
      <Button
        size="sm"
        variant="ghost"
        disabled={pending || !canNotify}
        title={
          canNotify
            ? notify
              ? "Stop emailing them about big project events"
              : "Email them when something big happens on this project"
            : "No email on record — edit the person to add one"
        }
        onClick={() =>
          run(
            () => toggleNotify(personId),
            notify ? "Notifications off." : "They'll get an email on big project events."
          )
        }
      >
        {notify ? <Bell className="size-4" /> : <BellOff className="size-4 opacity-50" />}
        <span className="sr-only">Toggle notifications</span>
      </Button>
      )}
      {!(rolesLocked && (role === "PI" || role === "FIRST_AUTHOR")) && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() => run(() => removeProjectPerson(personId), "Removed from the lineup.")}
        >
          Remove
        </Button>
      )}
    </div>
  );
}
