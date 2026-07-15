/**
 * Apply committed SQL migrations (./drizzle) to the database.
 *
 *   npm run db:migrate            # local (./data/mebar.db or DATABASE_URL)
 *
 * In production this runs automatically on container start (see Dockerfile
 * CMD), so `git pull && docker compose up -d --build` is the whole upgrade.
 * Safe on: a fresh empty file (runs everything), a pre-journal database
 * created by drizzle-kit push (adopts the baseline without executing it),
 * and an up-to-date database (no-op). Takes an online backup next to the DB
 * file before applying anything to a non-empty database.
 */
import { resolve } from "node:path";
import { runMigrations } from "../src/lib/db/migrate";

async function main() {
  const dbPath = process.env.DATABASE_URL ?? "./data/mebar.db";
  const migrationsFolder = resolve(process.cwd(), "drizzle");
  const result = await runMigrations(dbPath, migrationsFolder);
  if (result.adoptedBaseline) {
    console.log("Adopted existing database: baseline migration recorded as already applied.");
  }
  if (result.backupPath) console.log(`Pre-migrate backup: ${result.backupPath}`);
  console.log(
    result.applied === 0
      ? "Database is up to date — nothing to apply."
      : `Applied ${result.applied} migration(s).`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
