"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateFightRules } from "@/actions/settings";
import type { FightType } from "@/lib/fight-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface FightRuleRow {
  type: FightType;
  enabled: boolean;
  title: string;
  blurb: string;
}

/**
 * Per-rule Fight List config: on/off switch, section title and blurb, and
 * ordering (the row order IS the section order).
 */
export function FightRulesEditor({ initial }: { initial: FightRuleRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<FightRuleRow[]>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);

  function patch(type: FightType, patchValue: Partial<FightRuleRow>) {
    setRows((list) =>
      list.map((r) => (r.type === type ? { ...r, ...patchValue } : r))
    );
  }

  function move(index: number, delta: -1 | 1) {
    setRows((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const fd = new FormData();
    fd.set("items", JSON.stringify(rows));
    const result = await updateFightRules(fd);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Fight rules saved. The list recalculates immediately.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((rule, index) => (
        <div
          key={rule.type}
          className={`flex flex-col gap-2 rounded-md border p-3 ${rule.enabled ? "" : "opacity-60"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={rule.enabled}
                onChange={(e) => patch(rule.type, { enabled: e.target.checked })}
              />
              <code className="text-xs text-muted-foreground">{rule.type}</code>
            </label>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move ${rule.title} up`}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move ${rule.title} down`}
              >
                ↓
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <Input
              value={rule.title}
              onChange={(e) => patch(rule.type, { title: e.target.value })}
              aria-label={`${rule.type} section title`}
            />
            <Input
              value={rule.blurb}
              onChange={(e) => patch(rule.type, { blurb: e.target.value })}
              aria-label={`${rule.type} section blurb`}
            />
          </div>
        </div>
      ))}
      <Button onClick={save} disabled={saving} className="self-start">
        {saving ? "Saving…" : "Save fight rules"}
      </Button>
    </div>
  );
}
