"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({
  isManager,
  fightCount,
}: {
  isManager: boolean;
  fightCount: number;
}) {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Fight List", badge: fightCount },
    { href: "/board", label: "Board" },
    ...(isManager ? [{ href: "/admin/users", label: "People" }] : []),
  ];

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
            {"badge" in link && (link.badge ?? 0) > 0 && (
              <span className="rounded-full bg-red-500/90 px-1.5 text-xs font-semibold tabular-nums text-white">
                {link.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
