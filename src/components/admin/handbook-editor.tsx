"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-utils";
import type { HandbookSection } from "@/lib/settings-defaults";

export function HandbookEditor({
  sections: initial,
  action,
  successMessage = "Handbook saved.",
}: {
  sections: HandbookSection[];
  action: (formData: FormData) => Promise<ActionResult>;
  successMessage?: string;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<HandbookSection[]>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);

  function patch(index: number, value: Partial<HandbookSection>) {
    setSections((list) => list.map((s, i) => (i === index ? { ...s, ...value } : s)));
  }
  function add() {
    setSections((list) => [...list, { title: "", body: "" }]);
  }
  function remove(index: number) {
    setSections((list) => list.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    const fd = new FormData();
    fd.set("items", JSON.stringify(sections));
    const result = await action(fd);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(successMessage);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`hb-title-${i}`}>Section title</Label>
              <Input
                id={`hb-title-${i}`}
                value={section.title}
                onChange={(e) => patch(i, { title: e.target.value })}
                placeholder="e.g. Meeting rhythm"
              />
            </div>
            <Button variant="ghost" size="sm" className="mt-6" onClick={() => remove(i)}>
              Remove
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`hb-body-${i}`}>Body</Label>
            <Textarea
              id={`hb-body-${i}`}
              rows={5}
              value={section.body}
              onChange={(e) => patch(i, { body: e.target.value })}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={add}>
          Add section
        </Button>
        <Button onClick={save} disabled={saving} className="ml-auto">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
