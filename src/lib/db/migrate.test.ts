import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate";

const MIGRATIONS = resolve(__dirname, "../../../drizzle");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mebar-migrate-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function tables(dbPath: string): string[] {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    return (
      sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as { name: string }[]
    ).map((r) => r.name);
  } finally {
    sqlite.close();
  }
}

function journalRows(dbPath: string): number {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    return (
      sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }
    ).n;
  } finally {
    sqlite.close();
  }
}

/** Execute one migration file's statements raw — simulates a push-created DB. */
function execMigrationRaw(dbPath: string, sqlFile: string) {
  const sql = readFileSync(join(MIGRATIONS, sqlFile), "utf8");
  const sqlite = new Database(dbPath);
  try {
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const s = stmt.trim();
      if (s) sqlite.exec(s);
    }
  } finally {
    sqlite.close();
  }
}

function baselineFile(): string {
  return readdirSync(MIGRATIONS).filter((f) => f.startsWith("0000") && f.endsWith(".sql"))[0];
}

describe("runMigrations", () => {
  it("builds a fresh database from nothing", async () => {
    const db = join(dir, "fresh.db");
    const result = await runMigrations(db, MIGRATIONS);
    expect(result.adoptedBaseline).toBe(false);
    expect(result.applied).toBeGreaterThanOrEqual(1);
    expect(result.backupPath).toBeNull(); // nothing to protect
    const t = tables(db);
    for (const expected of ["projects", "blockers", "initiatives", "feedback", "lab_settings"]) {
      expect(t).toContain(expected);
    }
    expect(t).toContain("__drizzle_migrations");
  });

  it("adopts a push-created baseline DB without re-executing the baseline", async () => {
    const db = join(dir, "prod.db");
    execMigrationRaw(db, baselineFile()); // v5 schema, no journal
    const probe = new Database(db);
    probe
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1','Probe','p@x', 1, 0, 0)"
      )
      .run();
    probe
      .prepare(
        "INSERT INTO projects (id, title, owner_id, advisor_id, created_at) VALUES ('p1','Probe','u1','u1', 0)"
      )
      .run();
    probe.close();

    const result = await runMigrations(db, MIGRATIONS);
    expect(result.adoptedBaseline).toBe(true);
    // Re-executing 0000 would have thrown "table already exists"; reaching
    // here with the probe rows intact is the proof.
    const sqlite = new Database(db, { readonly: true });
    const user = sqlite.prepare("SELECT name FROM user WHERE id = 'u1'").get() as {
      name: string;
    };
    const project = sqlite.prepare("SELECT title FROM projects WHERE id = 'p1'").get() as {
      title: string;
    };
    sqlite.close();
    expect(user.name).toBe("Probe");
    expect(project.title).toBe("Probe");
    expect(journalRows(db)).toBeGreaterThanOrEqual(1);
  });

  it("no-ops on an up-to-date database without a new backup", async () => {
    const db = join(dir, "current.db");
    await runMigrations(db, MIGRATIONS);
    const before = journalRows(db);
    const second = await runMigrations(db, MIGRATIONS);
    expect(second.applied).toBe(0);
    expect(second.adoptedBaseline).toBe(false);
    expect(second.backupPath).toBeNull();
    expect(journalRows(db)).toBe(before);
  });

  it("takes a pre-migrate backup when applying to a non-empty adopted database", async () => {
    const db = join(dir, "backup.db");
    execMigrationRaw(db, baselineFile());
    const later = readdirSync(MIGRATIONS).some((f) => /^0*[1-9]\d*_.*\.sql$/.test(f));
    const result = await runMigrations(db, MIGRATIONS);
    if (later) {
      // adoption recorded 0000, then 0001+ applied → backup taken
      expect(result.backupPath).not.toBeNull();
      expect(readdirSync(dir).some((f) => f.includes(".pre-migrate-"))).toBe(true);
    } else {
      // only the baseline exists (C1 state): adoption alone applies nothing
      expect(result.applied).toBe(0);
      expect(result.backupPath).toBeNull();
    }
  });

  it("refuses a database pushed ahead of the journal", async () => {
    const db = join(dir, "drifted.db");
    execMigrationRaw(db, baselineFile());
    const sqlite = new Database(db);
    sqlite.exec("CREATE TABLE project_people (id text PRIMARY KEY)"); // beyond baseline, no journal
    sqlite.close();
    await expect(runMigrations(db, MIGRATIONS)).rejects.toThrow(/migration journal/);
  });
});
