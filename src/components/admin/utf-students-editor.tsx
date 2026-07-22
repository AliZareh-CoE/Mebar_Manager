"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  addUtfStudent,
  renameUtfStudent,
  setUtfStudentArchived,
} from "@/actions/utf-students";
import { FormDialog } from "@/components/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The UTF-student roster editor: name-only entries the admin curates so
 * project lineups can tag students without creating accounts. Archive,
 * never delete — tagged history keeps rendering.
 */
export function UtfStudentsEditor({
  students,
}: {
  students: { id: string; name: string; archived: boolean }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");

  async function run(fn: () => Promise<{ error?: string } | void>, success: string) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    router.refresh();
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData();
    form.set("name", name);
    await run(() => addUtfStudent(form), "Student added to the roster.");
    setName("");
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Student name"
          aria-label="New UTF student name"
          className="w-full sm:w-64"
          required
        />
        <Button type="submit" disabled={pending || name.trim().length === 0}>
          Add student
        </Button>
      </form>

      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody on the roster yet. Add students here, then tag them on a
          project&apos;s People tab.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {students.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm"
            >
              <span className={s.archived ? "text-muted-foreground line-through" : "font-medium"}>
                {s.name}
                {s.archived && (
                  <Badge variant="outline" className="ml-2 text-muted-foreground">
                    archived
                  </Badge>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <FormDialog
                  trigger={
                    <Button size="sm" variant="outline" aria-label={`Rename ${s.name}`}>
                      Rename
                    </Button>
                  }
                  title={`Rename ${s.name}`}
                  submitLabel="Save"
                  successMessage="Renamed."
                  action={renameUtfStudent.bind(null, s.id)}
                >
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" defaultValue={s.name} required />
                  </div>
                </FormDialog>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setUtfStudentArchived(s.id, !s.archived),
                      s.archived ? "Restored." : "Archived — their history stays."
                    )
                  }
                >
                  {s.archived ? "Restore" : "Archive"}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
