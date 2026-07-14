import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

// Singleton across dev HMR reloads — otherwise every hot reload opens a new
// SQLite handle.
const globalForDb = globalThis as unknown as {
  __mebarDb?: BetterSQLite3Database<typeof schema>;
};

function createDb() {
  const url = process.env.DATABASE_URL ?? "./data/mebar.db";
  fs.mkdirSync(path.dirname(url), { recursive: true });
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.__mebarDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__mebarDb = db;
}
