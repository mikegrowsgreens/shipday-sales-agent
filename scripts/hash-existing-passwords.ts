/**
 * Migration script: Hash existing plaintext passwords in crm.users.
 *
 * Run with: npx tsx scripts/hash-existing-passwords.ts
 *
 * Safety: Only hashes passwords that are NOT already bcrypt hashes
 * (bcrypt hashes start with "$2a$" or "$2b$").
 */
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL_WINCALL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL_WINCALL env var');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ user_id: number; password_hash: string }>(
      `SELECT user_id, password_hash FROM crm.users WHERE password_hash IS NOT NULL`
    );

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      // Skip already-hashed passwords (bcrypt hashes start with $2a$ or $2b$)
      if (row.password_hash.startsWith('$2a$') || row.password_hash.startsWith('$2b$')) {
        skipped++;
        continue;
      }

      const hash = await bcrypt.hash(row.password_hash, 12);
      await client.query(
        `UPDATE crm.users SET password_hash = $1 WHERE user_id = $2`,
        [hash, row.user_id]
      );
      updated++;
      console.log(`  Hashed password for user_id=${row.user_id}`);
    }

    console.log(`\nDone: ${updated} passwords hashed, ${skipped} already hashed.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
