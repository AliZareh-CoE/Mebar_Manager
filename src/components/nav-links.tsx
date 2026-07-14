"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Fight List" },
  { href: "/board", label: "Board" },
];

export function NavLinks({ isManager }: { isManager: boolean }) {
  const pathname = usePathname();
  const all = isManager
    ? [...links, { href: "/admin/users", label: "People" }]
    : links;

  return (
    <nav className="flex items-center gap-1">
      {all.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
