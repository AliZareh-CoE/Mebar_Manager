"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-utils";

/**
 * Generic dialog around a server action. Server pages pass a (bound) action
 * and the form fields as children; this handles pending state, error toasts,
 * closing, and refresh.
 */
export function FormDialog({
  trigger,
  title,
  description,
  submitLabel = "Save",
  successMessage = "Saved.",
  action,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  submitLabel?: string;
  successMessage?: string;
  action: (formData: FormData) => Promise<ActionResult | void>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await action(new FormData(event.currentTarget));
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    // disablePointerDismissal: a stray backdrop click must not eat a
    // half-written update. Esc and the close button still work.
    <Dialog open={open} onOpenChange={setOpen} disablePointerDismissal>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {children}
          <Button type="submit" disabled={pending}>
            {pending ? "Working…" : submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
