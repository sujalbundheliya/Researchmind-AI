#!/usr/bin/env node
/**
 * Minimal forward-only migration runner.
 * Runs every migrations/*.sql not yet recorded in the _migrations table, in
 * filename order. Idempotent — safe to run repeatedly. Reuses the same SSL
 * settings as the app's pool but opens its own connection so the script exits
 * cleanly (config/db.js keeps a keepalive interval open for the server).
 *
 *   npm run migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to BE/.env');
    process.exit(1);
  }
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = new Set(
      (await pool.query('SELECT name FROM _migrations')).rows.map((r) => r.name)
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`• skip   ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`▶ apply  ${file} ... `);
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      console.log('done');
      ran += 1;
    }

    console.log(ran === 0 ? '\nNothing to migrate — schema up to date.' : `\nApplied ${ran} migration(s).`);
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
