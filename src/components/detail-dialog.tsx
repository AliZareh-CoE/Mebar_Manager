"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type DetailField = {
  label: string;
  value: React.ReactNode;
};

/**
 * Read-only "see everything" modal. Tables truncate long text to keep rows
 * scannable; the trigger (usually the truncated cell itself) opens the full
 * record. Fields whose value is empty are dropped, so callers can pass
 * optional data unconditionally.
 */
export function DetailDialog({
  trigger,
  title,
  fields,
}: {
  trigger: React.ReactElement;
  /** Full title text — wraps in the modal, never truncates. */
  title: string;
  fields: DetailField[];
}) {
  const rows = fields.filter(
    (f) => f.value !== null && f.value !== undefined && f.value !== ""
  );
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug break-words whitespace-pre-wrap">
            {title}
          </DialogTitle>
        </DialogHeader>
        <dl className="flex flex-col gap-3">
          {rows.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
              <dd className="text-sm break-words whitespace-pre-wrap">{f.value}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
