"use client";

import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ENTITIES: { key: string; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "papers", label: "Papers" },
  { key: "members", label: "Member contributions" },
  { key: "utf", label: "UTF students" },
  { key: "blockers", label: "Blockers" },
  { key: "requests", label: "Requests" },
];

/** CSV data downloads for Excel — one file per entity. */
export function StatsExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            <Download className="size-4" />
            {`Data (CSV)`}
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {ENTITIES.map((e) => (
          <DropdownMenuItem
            key={e.key}
            render={<a href={`/api/reports/csv?entity=${e.key}`}>{e.label}</a>}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
