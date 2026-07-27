import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ADMIN_TABLES, adminTableNames } from "@/lib/admin-db";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Django-admin-style index: every table in the database, with row counts.
 * The escape hatch for records the normal UI won't let anyone touch.
 */
export default async function AdminDbPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const tables = adminTableNames().map((name) => ({
    name,
    count:
      db
        .select({ c: sql<number>`count(*)` })
        .from(ADMIN_TABLES[name])
        .get()?.c ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Database</h1>
        <p className="text-sm text-muted-foreground">
          Every table, editable directly — the escape hatch when the normal
          rules won&apos;t let you fix something.
        </p>
      </div>
      <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
        <span className="font-medium text-red-600 dark:text-red-400">
          Handle with care:
        </span>{" "}
        edits here skip every workflow rule and validation. Everything is
        audit-logged, and the nightly backup plus pre-migration snapshots are
        your undo button.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((t) => (
          <Link key={t.name} href={`/admin/db/${t.name}`} className="group">
            <Card className="transition-colors group-hover:border-foreground/30">
              <CardContent className="flex items-center justify-between pt-0">
                <span className="font-mono text-sm font-medium">{t.name}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {t.count} row{t.count === 1 ? "" : "s"}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
