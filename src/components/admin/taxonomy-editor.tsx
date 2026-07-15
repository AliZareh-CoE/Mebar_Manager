"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { slugifyKey } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-utils";

export interface TaxonomyEditorItem {
  key: string;
  label: string;
  archived: boolean;
  /** Only server types carry this; rendered when practiceOptions is set. */
  mandatoryPractices?: string[];
}

/**
 * Generic list editor for admin-defined categories: rename, archive/restore,
 * add. Keys are permanent (slugified from the label at add time); archived
 * items keep rendering on existing rows but can't be picked for new ones.
 */
export function TaxonomyEditor({
  items: initial,
  action,
  addPlaceholder = "New entry",
  successMessage = "Saved.",
  practiceOptions,
}: {
  items: TaxonomyEditorItem[];
  /** Server action receiving FormData with an `items` JSON field. */
  action: (formData: FormData) => Promise<ActionResult>;
  addPlaceholder?: string;
  successMessage?: string;
  /** When set (server types), each row gets mandatory-practice checkboxes. */
  practiceOptions?: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<TaxonomyEditorItem[]>(() =>
    structuredClone(initial)
  );
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  function patch(key: string, patchValue: Partial<TaxonomyEditorItem>) {
    setItems((list) =>
      list.map((i) => (i.key === key ? { ...i, ...patchValue } : i))
    );
  }

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    const key = slugifyKey(label, items.map((i) => i.key));
    setItems((list) => [
      ...list,
      {
        key,
        label,
        archived: false,
        ...(practiceOptions ? { mandatoryPractices: [] } : {}),
      },
    ]);
    setNewLabel("");
  }

  function toggleMandatory(key: string, practiceKey: string) {
    setItems((list) =>
      list.map((i) => {
        if (i.key !== key) return i;
        const current = i.mandatoryPractices ?? [];
        return {
          ...i,
          mandatoryPractices: current.includes(practiceKey)
            ? current.filter((p) => p !== practiceKey)
            : [...current, practiceKey],
        };
      })
    );
  }

  async function save() {
    setSaving(true);
    const fd = new FormData();
    fd.set("items", JSON.stringify(items));
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
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div
          key={item.key}
          className={`flex flex-col gap-2 rounded-md border p-3 ${item.archived ? "opacity-60" : ""}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-64 flex-1"
              value={item.label}
              onChange={(e) => patch(item.key, { label: e.target.value })}
            />
            <code className="text-xs text-muted-foreground">{item.key}</code>
            {item.archived && <Badge variant="outline">archived</Badge>}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => patch(item.key, { archived: !item.archived })}
            >
              {item.archived ? "Restore" : "Archive"}
            </Button>
          </div>
          {practiceOptions && !item.archived && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1">
              <span className="text-xs text-muted-foreground">Mandatory:</span>
              {practiceOptions.map((p) => (
                <label key={p.key} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={(item.mandatoryPractices ?? []).includes(p.key)}
                    onChange={() => toggleMandatory(item.key, p.key)}
                  />
                  {p.label.split(" — ")[0].split(" (")[0]}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`add-${addPlaceholder}`}>Add</Label>
          <Input
            id={`add-${addPlaceholder}`}
            placeholder={addPlaceholder}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-64"
          />
        </div>
        <Button variant="outline" onClick={add} disabled={!newLabel.trim()}>
          Add
        </Button>
        <Button onClick={save} disabled={saving} className="ml-auto">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
