"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

function generateTempPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
}

/** Per-row admin menu on the People page: reset password, edit name, change role. */
export function UserAdminActions({
  userId,
  name,
  role,
  isCoordinator,
  isSelf,
}: {
  userId: string;
  name: string;
  role: string;
  isCoordinator: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"reset" | "rename" | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function resetPassword() {
    setPending(true);
    const newPassword = generateTempPassword();
    const { error } = await authClient.admin.setUserPassword({ userId, newPassword });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Reset failed.");
      return;
    }
    setTempPassword(newPassword);
  }

  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newName = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!newName) return;
    setPending(true);
    const { error } = await authClient.admin.updateUser({ userId, data: { name: newName } });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Rename failed.");
      return;
    }
    toast.success("Name updated.");
    setDialog(null);
    router.refresh();
  }

  async function setRole(newRole: "MANAGER" | "ENGINEER" | "SECRETARY") {
    if (isCoordinator && role === "MANAGER" && newRole !== "MANAGER") {
      toast.error("Hand the compute-coordinator role to someone else first.");
      return;
    }
    setPending(true);
    const { error } = await authClient.admin.setRole({ userId, role: newRole });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Role change failed.");
      return;
    }
    toast.success("Role changed.");
    router.refresh();
  }

  const ROLE_LABELS = {
    MANAGER: "manager",
    ENGINEER: "engineer",
    SECRETARY: "secretary",
  } as const;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" aria-label={`Manage ${name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog("reset")}>
            Reset password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            Edit name
          </DropdownMenuItem>
          {!isSelf &&
            (Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>)
              .filter((r) => r !== role)
              .map((r) => (
                <DropdownMenuItem key={r} onClick={() => setRole(r)}>
                  Make {ROLE_LABELS[r]}
                </DropdownMenuItem>
              ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialog === "reset"}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setTempPassword(null);
          }
        }}
        disablePointerDismissal
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset {name}&apos;s password</DialogTitle>
            <DialogDescription>
              {tempPassword
                ? "Give them this temporary password — it will not be shown again. They can change it on their Account page."
                : "Generates a temporary password and signs them out everywhere."}
            </DialogDescription>
          </DialogHeader>
          {tempPassword ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {tempPassword}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(tempPassword);
                  toast.success("Copied.");
                }}
              >
                Copy
              </Button>
            </div>
          ) : (
            <Button onClick={resetPassword} disabled={pending}>
              {pending ? "Resetting…" : "Reset password"}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        disablePointerDismissal
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit name</DialogTitle>
          </DialogHeader>
          <form onSubmit={rename} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rename-${userId}`}>Name</Label>
              <Input id={`rename-${userId}`} name="name" defaultValue={name} required />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
