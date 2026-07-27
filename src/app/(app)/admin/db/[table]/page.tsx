import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  ADMIN_TABLES,
  adminColumns,
  type AdminColumn,
} from "@/lib/admin-db";
import { adminDeleteRow, adminInsertRow, adminUpdateRow } from "@/actions/admin-db";
import { matchesQuery } from "@/lib/search";
import { SearchBar } from "@/components/search-bar";
import { DetailDialog } from "@/components/detail-dialog";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Row = Record<string, unknown>;

/** Human-readable cell text for any column value. */
function fmt(value: unknown, kind: AdminColumn["kind"]): string {
  if (value === null || value === undefined) return "—";
  if (kind === "boolean") return value ? "true" : "false";
  if (kind === "date" && value instanceof Date) return format(value, "yyyy-MM-dd HH:mm");
  if (kind === "json") return JSON.stringify(value);
  return String(value);
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** One typed form field per column, prefilled from `row` when editing. */
function ColumnField({
  col,
  row,
  idPrefix,
}: {
  col: AdminColumn;
  row: Row | null;
  idPrefix: string;
}) {
  const value = row?.[col.key];
  const id = `${idPrefix}-${col.key}`;
  const label = (
    <Label htmlFor={id} className="font-mono text-xs">
      {col.dbName}
      {col.notNull && !col.hasDefault ? " *" : ""}
    </Label>
  );
  if (col.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm" htmlFor={id}>
        <input
          id={id}
          name={col.key}
          type="checkbox"
          defaultChecked={!!value}
          className="size-4 accent-primary"
        />
        <span className="font-mono text-xs">{col.dbName}</span>
      </label>
    );
  }
  if (col.kind === "date") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Input
          id={id}
          name={col.key}
          type="datetime-local"
          defaultValue={value instanceof Date ? format(value, "yyyy-MM-dd'T'HH:mm") : ""}
        />
      </div>
    );
  }
  if (col.kind === "number") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Input
          id={id}
          name={col.key}
          type="number"
          step="any"
          defaultValue={value === null || value === undefined ? "" : String(value)}
        />
      </div>
    );
  }
  if (col.kind === "json") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <Textarea
          id={id}
          name={col.key}
          rows={4}
          className="font-mono text-xs"
          defaultValue={value === null || value === undefined ? "" : JSON.stringify(value)}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <Textarea
        id={id}
        name={col.key}
        rows={2}
        defaultValue={value === null || value === undefined ? "" : String(value)}
      />
    </div>
  );
}

export default async function AdminDbTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const { table: tableName } = await params;
  const { q, page: pageParam } = await searchParams;
  const table = ADMIN_TABLES[tableName];
  if (!table) notFound();

  const cols = adminColumns(table);
  const hasId = cols.some((c) => c.key === "id");
  const hasCreatedAt = cols.some((c) => c.key === "createdAt");

  let rows = db.select().from(table).all() as Row[];
  if (hasCreatedAt) {
    rows = rows
      .slice()
      .sort(
        (a, b) =>
          ((b.createdAt as Date | null)?.getTime() ?? 0) -
          ((a.createdAt as Date | null)?.getTime() ?? 0)
      );
  }
  const filtered = rows.filter((r) =>
    matchesQuery(q, ...cols.map((c) => fmt(r[c.key], c.kind)))
  );
  const page = Math.max(1, Number(pageParam) || 1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // id first, then the first few data columns — the rest live in the dialogs.
  const displayCols = [
    ...cols.filter((c) => c.key === "id"),
    ...cols.filter((c) => c.key !== "id").slice(0, 4),
  ];

  const rowId = (r: Row) => String(r.id ?? "");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/admin/db" className="underline-offset-4 hover:underline">
              Database
            </Link>
            <span>/</span>
          </div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{tableName}</h1>
          <SearchBar placeholder="Search rows…" className="mt-2" />
          <p className="mt-1 text-xs text-muted-foreground">
            {filtered.length} row{filtered.length === 1 ? "" : "s"}
            {q ? ` matching “${q}”` : ""} · edits skip every rule; everything is
            audit-logged.
          </p>
        </div>
        <FormDialog
          trigger={<Button>Add row</Button>}
          title={`Add to ${tableName}`}
          description="Leave a field blank to use the column's default (ids and timestamps fill themselves). * = required."
          submitLabel="Insert"
          successMessage="Row added."
          action={adminInsertRow.bind(null, tableName)}
          size="lg"
        >
          {cols.map((col) => (
            <ColumnField key={col.key} col={col} row={null} idPrefix={`new-${tableName}`} />
          ))}
        </FormDialog>
      </div>

      {pageRows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {q ? "No rows match the search." : "This table is empty."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {displayCols.map((c) => (
                <TableHead key={c.key} className="font-mono text-xs">
                  {c.dbName}
                </TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r, i) => (
              <TableRow key={hasId ? rowId(r) : i}>
                {displayCols.map((c, ci) => (
                  <TableCell key={c.key} className="max-w-56">
                    {ci === 0 ? (
                      <DetailDialog
                        title={`${tableName} row`}
                        fields={cols.map((fc) => ({
                          label: fc.dbName,
                          value: fmt(r[fc.key], fc.kind),
                        }))}
                        trigger={
                          <button
                            type="button"
                            className="block w-full cursor-pointer truncate text-left font-mono text-xs underline-offset-4 hover:underline"
                          >
                            {clip(fmt(r[c.key], c.kind), 80)}
                          </button>
                        }
                      />
                    ) : (
                      <span className="block truncate text-xs text-muted-foreground">
                        {clip(fmt(r[c.key], c.kind), 80)}
                      </span>
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {hasId && (
                      <>
                        <FormDialog
                          trigger={<Button variant="ghost" size="sm">Edit</Button>}
                          title={`Edit ${tableName} row`}
                          description={`id: ${rowId(r)}`}
                          submitLabel="Save"
                          successMessage="Row updated."
                          action={adminUpdateRow.bind(null, tableName, rowId(r))}
                          size="lg"
                        >
                          {cols
                            .filter((c) => c.key !== "id")
                            .map((col) => (
                              <ColumnField
                                key={col.key}
                                col={col}
                                row={r}
                                idPrefix={`edit-${tableName}-${rowId(r)}`}
                              />
                            ))}
                        </FormDialog>
                        <FormDialog
                          trigger={
                            <Button variant="ghost" size="sm" className="text-red-600 dark:text-red-400">
                              Delete
                            </Button>
                          }
                          title={`Delete ${tableName} row`}
                          description={`id: ${rowId(r)} — this cannot be undone from the app.`}
                          submitLabel="Delete row"
                          successMessage="Row deleted."
                          action={adminDeleteRow.bind(null, tableName, rowId(r))}
                        >
                          <p className="text-sm text-muted-foreground">
                            Rows referencing this one are not cleaned up automatically.
                          </p>
                        </FormDialog>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pageCount > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link
              className="underline-offset-4 hover:underline"
              href={`/admin/db/${tableName}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}
            >
              ← Newer
            </Link>
          )}
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link
              className="underline-offset-4 hover:underline"
              href={`/admin/db/${tableName}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}
            >
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
