import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getPolicy } from "@/lib/policy-server";
import { createSop } from "@/actions/sops";
import { SopCard } from "@/components/sop-card";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";

function SopFields() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sop-title">Name</Label>
        <Input id="sop-title" name="title" placeholder="e.g. Cryostat cooldown" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sop-body">Overview</Label>
        <Textarea
          id="sop-body"
          name="body"
          rows={3}
          placeholder="When and why to run this, gotchas."
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sop-checklist">Checklist — one step per line</Label>
        <Textarea
          id="sop-checklist"
          name="checklist"
          rows={6}
          placeholder={"Purge the line with dry nitrogen\nStart the compressor\n…"}
        />
      </div>
    </>
  );
}

export default async function SopsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  // Read surface for everyone doing lab work; secretaries live in /tasks.
  if (me.role === "SECRETARY") redirect("/tasks");

  const policy = await getPolicy(me);
  const canEdit = policy.can("sop.edit");

  const allSops = await db.query.sops.findMany({
    orderBy: (s) => desc(s.updatedAt),
  });
  const active = allSops.filter((s) => !s.archived);
  const archivedSops = allSops.filter((s) => s.archived);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Protocols</h1>
          <p className="text-sm text-muted-foreground">
            The lab&apos;s standard operating procedures. Expand one for the
            steps; copy a checklist to run it at the bench.
          </p>
        </div>
        {canEdit && (
          <FormDialog
            trigger={<Button>New protocol</Button>}
            title="New protocol"
            description="A repeatable procedure, with a checklist of steps (one per line)."
            submitLabel="Create"
            successMessage="Protocol created."
            action={createSop}
          >
            <SopFields />
          </FormDialog>
        )}
      </div>

      {active.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No protocols yet.{canEdit ? " Write the first one." : ""}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((s) => (
            <SopCard
              key={s.id}
              sop={{ id: s.id, title: s.title, body: s.body, checklist: s.checklist }}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      {archivedSops.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
          {archivedSops.map((s) => (
            <SopCard
              key={s.id}
              sop={{ id: s.id, title: s.title, body: s.body, checklist: s.checklist }}
              canEdit={canEdit}
              archived
            />
          ))}
        </section>
      )}
    </div>
  );
}
