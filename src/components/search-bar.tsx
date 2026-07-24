"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * URL-synced search box: types into ?q= (debounced, replace not push so
 * the back button isn't spammed). Server pages read the param and filter.
 */
export function SearchBar({
  placeholder = "Search…",
  param = "q",
  className,
}: {
  placeholder?: string;
  param?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next.trim()) params.set(param, next.trim());
    else params.delete(param);
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), 300);
  }

  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pr-8 pl-8"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setValue("");
            if (timer.current) clearTimeout(timer.current);
            commit("");
          }}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
