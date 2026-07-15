"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function CauseSelect({
  name = "causeTag",
  options,
  defaultValue,
}: {
  name?: string;
  /** Admin-defined cause tags (non-archived, plus the row's current tag). */
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  const fallback = defaultValue ?? options[0]?.value;
  return (
    <Select name={name} defaultValue={fallback}>
      <SelectTrigger>
        <SelectValue>
          {(v: string | null) =>
            (v && (options.find((o) => o.value === v)?.label ?? v)) || "Cause"
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
