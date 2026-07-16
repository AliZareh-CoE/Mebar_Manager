"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavLink = { href: string; label: string; badge?: number };

export function NavLinks({
  role,
  isCoordinator,
  fightCount,
}: {
  role: "ADMIN" | "MANAGER" | "ENGINEER" | "SECRETARY";
  isCoordinator: boolean;
  fightCount: number;
}) {
  const pathname = usePathname();
  const isLeadership = role === "ADMIN" || role === "MANAGER" || isCoordinator;
  // Secretaries live in their task list — no projects, board, or compute.
  const primary: NavLink[] =
    role === "SECRETARY"
      ? [
          { href: "/", label: "Fight List", badge: fightCount },
          { href: "/tasks", label: "Tasks" },
          { href: "/guide", label: "Guide" },
          { href: "/handbook", label: "Handbook" },
        ]
      : [
          { href: "/", label: "Fight List", badge: fightCount },
          { href: "/board", label: "Board" },
          { href: "/data", label: "Data" },
          { href: "/compute", label: "Compute" },
          { href: "/tasks", label: "Tasks" },
          { href: "/sops", label: "Protocols" },
          { href: "/guide", label: "Guide" },
          { href: "/handbook", label: "Handbook" },
        ];
  // The leadership/admin surfaces ride in a "More" menu on desktop so the
  // everyday links always fit on one line (priority-nav pattern).
  const secondary: NavLink[] = [
    ...(role !== "SECRETARY" && isLeadership
      ? [
          { href: "/meeting", label: "Meeting" },
          { href: "/initiatives", label: "Initiatives" },
          { href: "/performance", label: "Performance" },
        ]
      : []),
    // The dangerous stuff — admin only.
    ...(role === "ADMIN"
      ? [
          { href: "/admin/users", label: "People" },
          { href: "/admin/feedback", label: "Feedback" },
          { href: "/admin/settings", label: "Settings" },
          { href: "/admin/audit", label: "Audit" },
        ]
      : []),
  ];
  const all = [...primary, ...secondary];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const badge = (n: number | undefined, className?: string) =>
    (n ?? 0) > 0 ? (
      <span
        className={cn(
          "rounded-full bg-red-500/90 px-1.5 text-xs font-semibold tabular-nums text-white",
          className
        )}
      >
        {n}
      </span>
    ) : null;
  const menuItem = (link: NavLink) => (
    <DropdownMenuItem
      key={link.href}
      className={cn(isActive(link.href) && "bg-secondary")}
      render={
        <Link href={link.href}>
          {link.label}
          {badge(link.badge, "ml-auto")}
        </Link>
      }
    />
  );

  return (
    <nav className="flex min-w-0 items-center">
      {/* Desktop: everyday links inline, the rest behind More. */}
      <div className="hidden items-center gap-x-0.5 xl:flex">
        {primary.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs transition-colors",
              isActive(link.href)
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
            {badge(link.badge)}
          </Link>
        ))}
        {secondary.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "gap-1 px-2 text-xs font-normal",
                    secondary.some((l) => isActive(l.href))
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {`More`}
                  <ChevronDown className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-56">
              {secondary.map(menuItem)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Small screens: everything behind one menu button. */}
      <div className="xl:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" aria-label="Open navigation">
                <Menu className="size-4" />
                {badge(fightCount)}
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-56">
            {all.map(menuItem)}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/account">Account</Link>} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
