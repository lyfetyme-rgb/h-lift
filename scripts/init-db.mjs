// Ensure the SQLite database exists and is migrated to the current schema.
// Runs at container start before `next start`. Does not seed demo data unless
// SEED_DEMO=1 is set, so a production deployment keeps its own records.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dbPath = process.env.HLIFT_DB_PATH || join(root, "data", "hlift.db");

mkdirSync(dirname(dbPath), { recursive: true });

const seedDemo = process.env.SEED_DEMO === "1";
if (seedDemo) {
  // Reset and seed demo data. Using --reset avoids duplicate rows on restart.
  const { execSync } = await import("node:child_process");
  execSync("node scripts/seed.mjs --reset", { stdio: "inherit" });
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
db.exec(readFileSync(join(root, "db", "schema.sql"), "utf8"));

// Apply forward migrations (idempotent via schema_migrations ledger).
db.exec(
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     filename TEXT PRIMARY KEY,
     applied_at TEXT NOT NULL
   );`
);
const done = new Set(
  db.prepare("SELECT filename FROM schema_migrations").all().map((r) => r.filename)
);
const migDir = join(root, "db", "migrations");
if (existsSync(migDir)) {
  for (const file of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(migDir, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
      );
      db.exec("COMMIT");
      console.log(`applied migration ${file}`);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
db.close();
console.log(`database ready at ${dbPath}`);
