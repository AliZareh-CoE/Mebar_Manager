import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

/**
 * Migration runner with one job beyond drizzle's own `migrate()`: adopting a
 * database that predates the migration journal.
 *
 * Production was first materialized with `drizzle-kit push` (no
 * `__drizzle_migrations` table). Running plain `migrate()` there would try to
 * re-create every existing table and die. Instead, when we find domain tables
 * but no journal, we record the baseline migration (0000, which snapshots
 * exactly that schema) as already applied — without executing it — and let
 * `migrate()` apply only what comes after.
 */

const MIGRATIONS_TABLE = "__drizzle_migrations";
const PRE_MIGRATE_BACKUPS_KEPT = 5;

export interface MigrateResult {
  adoptedBaseline: boolean;
  applied: number;
  backupPath: string | null;
}

function tableExists(sqlite: Database.Database, name: string): boolean {
  return (
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined
  );
}

function pruneOldBackups(dbPath: string) {
  const dir = dirname(dbPath);
  const prefix = `${basename(dbPath)}.pre-migrate-`;
  const backups = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".bak"))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const old of backups.slice(PRE_MIGRATE_BACKUPS_KEPT)) unlinkSync(old);
}

export async function runMigrations(
  dbPath: string,
  migrationsFolder: string
): Promise<MigrateResult> {
  mkdirSync(dirname(dbPath), { recursive: true });
  const migrations = readMigrationFiles({ migrationsFolder });
  if (migrations.length === 0) throw new Error(`No migrations found in ${migrationsFolder}.`);

  // Own handle, not the app singleton: we need the backup API and a clean close.
  const sqlite = new Database(dbPath);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");

    const hasJournal = tableExists(sqlite, MIGRATIONS_TABLE);
    const hasBaselineTables = tableExists(sqlite, "projects");
    // Sentinel for "schema is already ahead of the baseline": the first
    // post-baseline table. If it exists without a journal, this DB was
    // `db:push`ed past 0000 and adoption would mis-record history.
    const hasPostBaselineTables = tableExists(sqlite, "project_people");

    let adoptedBaseline = false;
    if (!hasJournal && hasBaselineTables) {
      if (hasPostBaselineTables) {
        throw new Error(
          "This database has tables from beyond the baseline migration but no migration journal — " +
            "it was likely created with `db:push` on a newer schema. Recreate it (dev: delete the " +
            "file and run db:migrate) or investigate before migrating (prod)."
        );
      }
      const baseline = migrations[0];
      sqlite.exec(
        `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (\n` +
          `  id SERIAL PRIMARY KEY,\n  hash text NOT NULL,\n  created_at numeric\n)`
      );
      sqlite
        .prepare(`INSERT INTO "${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES (?, ?)`)
        .run(baseline.hash, baseline.folderMillis);
      adoptedBaseline = true;
    }

    // What will migrate() actually run? (Its rule: folderMillis > last created_at.)
    const lastApplied = tableExists(sqlite, MIGRATIONS_TABLE)
      ? (sqlite
          .prepare(`SELECT created_at FROM "${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`)
          .get() as { created_at: number } | undefined)
      : undefined;
    const pending = migrations.filter(
      (m) => !lastApplied || m.folderMillis > Number(lastApplied.created_at)
    ).length;

    // Safety net before touching an existing database: online backup next to
    // the DB file (complements, not replaces, the nightly deploy/backup.sh).
    let backupPath: string | null = null;
    if (pending > 0 && hasBaselineTables) {
      backupPath = `${dbPath}.pre-migrate-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
      await sqlite.backup(backupPath);
      pruneOldBackups(dbPath);
    }

    if (pending > 0) {
      migrate(drizzle(sqlite), { migrationsFolder });
    }

    return { adoptedBaseline, applied: pending, backupPath };
  } finally {
    sqlite.close();
  }
}
