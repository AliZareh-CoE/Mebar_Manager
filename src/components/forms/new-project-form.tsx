"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createProject } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HEILMEIER_FIELDS = [
  ["objective", "What are we trying to do? (no jargon)"],
  ["howItsDoneToday", "How is it done today, and what are the limits?"],
  ["whatsNew", "What's new in our approach — why will it succeed?"],
  ["whoCares", "Who cares if we succeed?"],
  ["risks", "What are the risks?"],
  ["killCriteria", "Kill criteria — what result makes us stop?"],
  ["successCriteria", "Success criteria — the mid-term and final exams"],
] as const;

export function NewProjectForm({
  people,
}: {
  people: { id: string; name: string; role: string | null }[];
}) {
  const [pending, setPending] = useState(false);
  const managers = people.filter((p) => p.role === "MANAGER");

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
              <Label>Owner (engineer)</Label>
              <Select name="ownerId" required>
                <SelectTrigger>
                  <SelectValue placeholder="Who drives it" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Advisor</Label>
              <Select name="advisorId" required>
                <SelectTrigger>
                  <SelectValue placeholder="Who unblocks it" />
                </SelectTrigger>
                <SelectContent>
                  {(managers.length > 0 ? managers : people).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {HEILMEIER_FIELDS.map(([field, label]) => (
            <div key={field} className="flex flex-col gap-2">
              <Label htmlFor={field}>{label}</Label>
              <Textarea id={field} name={field} rows={2} />
            </div>
          ))}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create proposal"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
