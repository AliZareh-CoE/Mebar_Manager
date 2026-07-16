"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export interface HelpCopy {
  title: string;
  body: string | string[];
}

/**
 * The little (?) that makes every mechanism explain itself. Hover opens it
 * on desktop, tap opens it on phones (the trigger is a real button), Escape
 * or an outside tap closes it. Content arrives as plain strings from server
 * components — this component never imports the copy catalog, so the whole
 * guide doesn't ride along in the client bundle.
 */
export function InfoHint({
  title,
  body,
  href,
  className,
}: HelpCopy & {
  /** Optional deep link into the guide, e.g. "/guide#scoring". */
  href?: string;
  className?: string;
}) {
  const paragraphs = Array.isArray(body) ? body : [body];
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        aria-label={`What is this: ${title}?`}
        data-slot="info-hint-trigger"
        className={`inline-flex shrink-0 align-middle text-muted-foreground/70 transition-colors hover:text-foreground ${className ?? ""}`}
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="flex max-w-72 flex-col gap-1.5">
        <p className="font-medium">{title}</p>
        {paragraphs.map((p, i) => (
          <p key={i} className="text-muted-foreground">
            {p}
          </p>
        ))}
        {href && (
          <Link
            href={href}
            className="text-xs font-medium underline-offset-4 hover:underline"
          >
            Full rules →
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
