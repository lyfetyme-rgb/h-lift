import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import path from "node:path";

/**
 * Encrypted H-LIFT database backup (NIST 800-53 SC-8 / cp-9, ISO 27001 A.8.13).
 *
 * Usage:
 *   HLIFT_BACKUP_PASSPHRASE=... npm run backup:encrypted -- [output-file]
 *
 * The passphrase is never written to disk. A fresh salt and IV are generated
 * for every backup, and AES-256-GCM gives both confidentiality and integrity.
 */
const MAGIC = Buffer.from("HLIFTENC", "utf8");
const VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const passphrase = process.env.HLIFT_BACKUP_PASSPHRASE;
if (!passphrase) {
  console.error("HLIFT_BACKUP_PASSPHRASE is required. Use a long, randomly generated passphrase and store it in your secrets manager.");
  process.exit(1);
}

const dbPath = process.env.HLIFT_DB_PATH || "./data/hlift.db";
if (!existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const output = process.argv[2] || path.join(
  "backups",
  `hlift-${new Date().toISOString().replace(/[:.]/g, "-")}.db.enc`
);
mkdirSync(path.dirname(output), { recursive: true });

const plaintext = readFileSync(dbPath);
const salt = randomBytes(SALT_BYTES);
const iv = randomBytes(IV_BYTES);
const key = scryptSync(passphrase, salt, 32);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();

const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv, tag]);
writeFileSync(output, Buffer.concat([header, ciphertext]), { mode: 0o600 });

console.log(`Encrypted backup: ${output}`);
console.log(`Plaintext bytes: ${plaintext.length}; encrypted bytes: ${header.length + ciphertext.length}`);
