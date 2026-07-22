"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog — "Save as PDF" lives there. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      Print / Save as PDF
    </Button>
  );
}
