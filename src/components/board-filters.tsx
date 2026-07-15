"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "ALL";

export function BoardFilters({
  owners,
  states,
}: {
  owners: { id: string; name: string }[];
  states: { key: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (!value || value === ALL) params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={searchParams.get("state") ?? ALL}
        onValueChange={(v) => setParam("state", v ? String(v) : null)}
      >
        <SelectTrigger size="sm" className="w-36">
          <SelectValue>
            {(v: string) =>
              v === ALL ? "All states" : (states.find((s) => s.key === v)?.label ?? v)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All states</SelectItem>
          {states.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get("owner") ?? ALL}
        onValueChange={(v) => setParam("owner", v ? String(v) : null)}
      >
        <SelectTrigger size="sm" className="w-36">
          <SelectValue>
            {(v: string) =>
              v === ALL ? "Everyone" : (owners.find((o) => o.id === v)?.name ?? "Everyone")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Everyone</SelectItem>
          {owners.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
