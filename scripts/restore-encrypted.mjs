import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createDecipheriv, scryptSync } from "node:crypto";

/**
 * Restore an encrypted H-LIFT backup.
 *
 * Usage:
 *   HLIFT_BACKUP_PASSPHRASE=... npm run restore:encrypted -- backups/file.db.enc [target.db]
 *
 * GCM authentication fails if the passphrase or ciphertext is wrong, so a bad
 * restore cannot silently produce a usable-but-corrupt database.
 */
const MAGIC = Buffer.from("HLIFTENC", "utf8");
const VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + SALT_BYTES + IV_BYTES + TAG_BYTES;

const passphrase = process.env.HLIFT_BACKUP_PASSPHRASE;
if (!passphrase) {
  console.error("HLIFT_BACKUP_PASSPHRASE is required.");
  process.exit(1);
}

const input = process.argv[2];
if (!input || !existsSync(input)) {
  console.error("Usage: npm run restore:encrypted -- <backup-file> [target-db]");
  process.exit(1);
}
const target = process.argv[3] || process.env.HLIFT_DB_PATH || "./data/hlift.db";

const blob = readFileSync(input);
if (blob.length < HEADER_BYTES || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
  console.error("Not an H-LIFT encrypted backup.");
  process.exit(1);
}
if (blob[MAGIC.length] !== VERSION) {
  console.error(`Unsupported backup version: ${blob[MAGIC.length]}`);
  process.exit(1);
}

let offset = MAGIC.length + 1;
const salt = blob.subarray(offset, offset + SALT_BYTES); offset += SALT_BYTES;
const iv = blob.subarray(offset, offset + IV_BYTES); offset += IV_BYTES;
const tag = blob.subarray(offset, offset + TAG_BYTES); offset += TAG_BYTES;
const ciphertext = blob.subarray(offset);

const key = scryptSync(passphrase, salt, 32);
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);

let plaintext;
try {
  plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
} catch {
  console.error("Restore failed: wrong passphrase or corrupted backup.");
  process.exit(1);
}

const temp = `${target}.restore.tmp`;
writeFileSync(temp, plaintext, { mode: 0o600 });
renameSync(temp, target);
console.log(`Restored ${input} -> ${target} (${plaintext.length} bytes)`);
console.log("Verify the audit chain before resuming: npm run db:verify");
