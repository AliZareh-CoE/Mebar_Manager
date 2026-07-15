"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAUSE_TAG_LABELS } from "@/lib/labels";

/**
 * Client wrappers so selected values render their labels (Base UI needs
 * function children on Value, which can't be passed from server components).
 */

export function PersonSelect({
  name,
  people,
  placeholder = "Choose…",
  defaultValue,
  required,
}: {
  name: string;
  people: { id: string; name: string }[];
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <Select name={name} defaultValue={defaultValue} required={required}>
      <SelectTrigger>
        <SelectValue>
          {(v: string | null) =>
            v ? (people.find((p) => p.id === v)?.name ?? placeholder) : placeholder
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EnumSelect({
  name,
  options,
  defaultValue,
  className,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  className?: string;
}) {
  return (
    <Select name={name} defaultValue={defaultValue}>
      <SelectTrigger className={className}>
        <SelectValue>
          {(v: string | null) =>
            options.find((o) => o.value === v)?.label ?? options[0]?.label ?? ""
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CauseSelect({ name = "causeTag" }: { name?: string }) {
  return (
    <Select name={name} defaultValue="TECHNICAL">
      <SelectTrigger>
        <SelectValue>
          {(v: string | null) =>
            (v && CAUSE_TAG_LABELS[v as keyof typeof CAUSE_TAG_LABELS]) || "Cause"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(CAUSE_TAG_LABELS).map(([tag, label]) => (
          <SelectItem key={tag} value={tag}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
