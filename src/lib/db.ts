import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = join(process.cwd(), "data", "hlift.db");
const SCHEMA_PATH = join(process.cwd(), "db", "schema.sql");
const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

declare global {
  // eslint-disable-next-line no-var
  var __hliftDb: DatabaseSync | undefined;
}

/** Last schema/migration failure, surfaced by /api/health instead of being hidden. */
let schemaInitError: string | null = null;
export function getSchemaError(): string | null {
  return schemaInitError;
}

/**
 * Apply the preserved baseline schema, then every forward migration in
 * lexical order. The ledger makes ALTER TABLE migrations idempotent across
 * restarts, which is required because SQLite has no IF NOT EXISTS for columns.
 */
export function applyMigrations(db: DatabaseSync) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`
  );

  let done = new Set<string>();
  try {
    done = new Set(
      (db.prepare("SELECT filename FROM schema_migrations").all() as { filename: string }[]).map(
        (r) => r.filename
      )
    );
  } catch {
    done = new Set();
  }

  if (!existsSync(MIGRATIONS_DIR)) return;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function open(): DatabaseSync {
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return db;
}

export function getDb(): DatabaseSync {
  if (!global.__hliftDb) {
    global.__hliftDb = open();
    // Idempotent schema bootstrap so a fresh clone works after seeding.
    try {
      global.__hliftDb.exec(readFileSync(SCHEMA_PATH, "utf8"));
      applyMigrations(global.__hliftDb);
    } catch (error) {
      // Keep running in standalone builds where the schema file may be absent,
      // but never hide the reason: the health check reports a degraded service
      // rather than rendering zero counts that look like real data.
      schemaInitError = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ severity: "ERROR", event: "db.schema_init_failed", error: schemaInitError }));
    }
  }
  return global.__hliftDb;
}

export function all<T = any>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}

export function one<T = any>(sql: string, ...params: unknown[]): T | null {
  return (getDb().prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
}

export function run(sql: string, ...params: unknown[]): void {
  getDb().prepare(sql).run(...(params as never[]));
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
