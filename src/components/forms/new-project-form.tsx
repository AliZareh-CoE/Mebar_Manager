"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createProject } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PersonSelect } from "@/components/forms/labeled-selects";
import { proposalFieldName } from "@/lib/proposal";

export function NewProjectForm({
  people,
  questions,
}: {
  people: { id: string; name: string; role: string | null }[];
  /** Admin-defined proposal questions (non-archived), from settings. */
  questions: { key: string; label: string; builtin: boolean }[];
}) {
  const [pending, setPending] = useState(false);
  const managers = people.filter((p) => p.role === "MANAGER" || p.role === "ADMIN");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await createProject(new FormData(event.currentTarget));
    // On success createProject redirects, so we only land here on error.
    setPending(false);
    if (result?.error) toast.error(result.error);
  }

  return (
    <Card>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">One-line description</Label>
            <Input id="description" name="description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Owner (researcher)</Label>
              <PersonSelect name="ownerId" people={people} placeholder="Who drives it" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Advisor</Label>
              <PersonSelect
                name="advisorId"
                people={managers.length > 0 ? managers : people}
                placeholder="Who unblocks it"
                required
              />
            </div>
          </div>
          {questions.map((q) => {
            const field = proposalFieldName(q);
            return (
              <div key={q.key} className="flex flex-col gap-2">
                <Label htmlFor={field}>{q.label}</Label>
                <Textarea id={field} name={field} rows={2} />
              </div>
            );
          })}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create proposal"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
