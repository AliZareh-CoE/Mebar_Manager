"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonSelect } from "@/components/forms/labeled-selects";

/**
 * Member XOR external picker for project lineups. Submits either `userId`
 * (lab member) or `externalName` + `affiliation` + `email` (someone who
 * never touches the app) — the action's refine enforces exactly one.
 */
export function PersonPicker({
  members,
  showTitle = true,
}: {
  members: { id: string; name: string }[];
  showTitle?: boolean;
}) {
  const [mode, setMode] = useState<"member" | "external">("member");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 text-sm">
        {(["member", "external"] as const).map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="__personMode"
              checked={mode === m}
              onChange={() => setMode(m)}
              className="accent-primary"
            />
            {m === "member" ? "Lab member" : "External person"}
          </label>
        ))}
      </div>

      {mode === "member" ? (
        <div className="flex flex-col gap-2">
          <Label>Person</Label>
          <PersonSelect name="userId" people={members} placeholder="Choose a member…" required />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="externalName">Name</Label>
            <Input id="externalName" name="externalName" placeholder="Dr. Maya Chen" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="affiliation">Affiliation</Label>
            <Input id="affiliation" name="affiliation" placeholder="TU Wien — external PI" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email (for project notifications)</Label>
            <Input id="email" name="email" type="email" placeholder="maya@university.edu" />
          </div>
        </>
      )}

      {showTitle && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Role note</Label>
          <Input id="title" name="title" placeholder="MSc student, assistant, collaborator…" />
        </div>
      )}
    </div>
  );
}
