"use client";

import { transitionPaper, editPaper } from "@/actions/papers";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PaperStatus } from "@/lib/db/schema";

/**
 * Status buttons for one paper row, driven by the pure lifecycle map's
 * requirements: submitting asks for the venue, rejecting/withdrawing for
 * the reason, accepting is one click (and terminal).
 */
export function PaperRowActions({
  paperId,
  status,
  venue,
  edit,
  canConfirmAccept,
}: {
  paperId: string;
  status: PaperStatus;
  venue: string;
  edit: { title: string; venue: string; quartileNote: string; link: string };
  /** Acceptance is confirmed by manager rank — the 8 points need a second pair of eyes. */
  canConfirmAccept: boolean;
}) {
  const submitLabel = status === "DRAFTING" ? "Submit…" : "Resubmit…";

  return (
    <div className="flex items-center justify-end gap-2">
      {(status === "DRAFTING" || status === "REJECTED" || status === "WITHDRAWN") && (
        <FormDialog
          trigger={<Button size="sm">{submitLabel}</Button>}
          title={status === "DRAFTING" ? "Submit the paper" : "Resubmit the paper"}
          description={
            status === "DRAFTING"
              ? "This starts the clock — submission earns points."
              : "Same manuscript, next venue. The closure note clears; fold anything worth keeping into the paper's notes first."
          }
          submitLabel="Mark submitted"
          successMessage="Submitted. Now we wait — loudly."
          action={(fd) => {
            fd.set("to", "SUBMITTED");
            return transitionPaper(paperId, fd);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`venue-${paperId}`}>Venue / journal</Label>
            <Input
              id={`venue-${paperId}`}
              name="venue"
              defaultValue={venue}
              placeholder="IEEE TII (Q1)"
              required
            />
          </div>
        </FormDialog>
      )}

      {status === "SUBMITTED" && (
        <>
          {canConfirmAccept && (
          <FormDialog
            trigger={<Button size="sm">Accepted 🎉</Button>}
            title="Paper accepted"
            description="The outcome every project owes the lab. This is terminal — and it scores."
            submitLabel="It's accepted"
            successMessage="Accepted. That's the whole point. 🎉"
            action={(fd) => {
              fd.set("to", "ACCEPTED");
              return transitionPaper(paperId, fd);
            }}
          >
            <p className="text-sm text-muted-foreground">
              Confirm the acceptance — it goes on the record and the standings.
            </p>
          </FormDialog>
          )}
          <FormDialog
            trigger={
              <Button size="sm" variant="outline">
                Rejected…
              </Button>
            }
            title="Paper rejected"
            description="It happens to everyone. The reason goes on the record; resubmission re-arms the fight."
            submitLabel="Record rejection"
            successMessage="Recorded. Pick the next venue."
            action={(fd) => {
              fd.set("to", "REJECTED");
              return transitionPaper(paperId, fd);
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rej-${paperId}`}>What did the reviewers say?</Label>
              <Textarea id={`rej-${paperId}`} name="closureNote" rows={3} required />
            </div>
          </FormDialog>
          <FormDialog
            trigger={
              <Button size="sm" variant="ghost" className="text-muted-foreground">
                Withdraw…
              </Button>
            }
            title="Withdraw the submission"
            description="Withdrawn papers earn nothing — the reason goes on the record."
            submitLabel="Withdraw"
            successMessage="Withdrawn."
            action={(fd) => {
              fd.set("to", "WITHDRAWN");
              return transitionPaper(paperId, fd);
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`wd-${paperId}`}>Why?</Label>
              <Textarea id={`wd-${paperId}`} name="closureNote" rows={3} required />
            </div>
          </FormDialog>
        </>
      )}

      {status !== "ACCEPTED" && (
        <FormDialog
          trigger={
            <Button size="sm" variant="ghost" className="text-muted-foreground">
              Edit
            </Button>
          }
          title="Edit paper"
          submitLabel="Save"
          action={(fd) => editPaper(paperId, fd)}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`et-${paperId}`}>Title</Label>
            <Input id={`et-${paperId}`} name="title" defaultValue={edit.title} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`ev-${paperId}`}>Venue / journal</Label>
            <Input id={`ev-${paperId}`} name="venue" defaultValue={edit.venue} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`eq-${paperId}`}>Quartile note</Label>
            <Input
              id={`eq-${paperId}`}
              name="quartileNote"
              defaultValue={edit.quartileNote}
              placeholder="Q1 — target"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`el-${paperId}`}>Link / DOI</Label>
            <Input id={`el-${paperId}`} name="link" defaultValue={edit.link} />
          </div>
        </FormDialog>
      )}
    </div>
  );
}
