"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { editSop, archiveSop } from "@/actions/sops";
import { CopyChecklistButton } from "@/components/copy-checklist-button";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function SopCard({
  sop,
  canEdit,
  archived = false,
}: {
  sop: { id: string; title: string; body: string; checklist: string[] };
  canEdit: boolean;
  archived?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggleArchive() {
    setPending(true);
    const result = await archiveSop(sop.id, !archived);
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(archived ? "Protocol restored." : "Protocol archived.");
    router.refresh();
  }

  return (
    <Card className={archived ? "opacity-60" : undefined}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left font-medium"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {sop.title}
        </button>
        {canEdit && (
          <div className="flex items-center gap-2">
            <FormDialog
              trigger={
                <Button variant="ghost" size="sm" aria-label={`Edit ${sop.title}`}>
                  Edit
                </Button>
              }
              title="Edit protocol"
              submitLabel="Save"
              successMessage="Protocol updated."
              action={(fd) => editSop(sop.id, fd)}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor={`sop-title-${sop.id}`}>Name</Label>
                <Input id={`sop-title-${sop.id}`} name="title" defaultValue={sop.title} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`sop-body-${sop.id}`}>Overview</Label>
                <Textarea id={`sop-body-${sop.id}`} name="body" rows={3} defaultValue={sop.body} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`sop-cl-${sop.id}`}>Checklist — one step per line</Label>
                <Textarea
                  id={`sop-cl-${sop.id}`}
                  name="checklist"
                  rows={6}
                  defaultValue={sop.checklist.join("\n")}
                />
              </div>
            </FormDialog>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={toggleArchive}
              aria-label={`${archived ? "Restore" : "Archive"} ${sop.title}`}
            >
              {archived ? "Restore" : "Archive"}
            </Button>
          </div>
        )}
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-4">
          {sop.body && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{sop.body}</p>
          )}
          {sop.checklist.length > 0 && (
            <ol className="flex flex-col gap-1.5 text-sm">
              {sop.checklist.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          <div>
            <CopyChecklistButton steps={sop.checklist} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
