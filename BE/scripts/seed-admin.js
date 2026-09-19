#!/usr/bin/env node
/**
 * Seed (or promote) the Super Admin account.
 *
 * Reads SUPER_ADMIN_EMAIL (default admin@researchmind.ai) and, optionally,
 * SUPER_ADMIN_PASSWORD from BE/.env. If no password is set one is generated and
 * printed once. Idempotent: re-running promotes the existing account to
 * super_admin / pro without clobbering a password you already know.
 *
 *   npm run seed:admin
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { getPlan } = require('../src/config/plans');

function generatePassword() {
  return crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) + 'A1!';
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to BE/.env');
    process.exit(1);
  }

  const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@researchmind.ai').trim();
  const explicitPassword = process.env.SUPER_ADMIN_PASSWORD;
  const password = explicitPassword || generatePassword();
  const proStorage = getPlan('pro').storageBytes;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    const existing = await pool.query('SELECT id, password FROM users WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      await pool.query(
        "UPDATE users SET role = 'super_admin', plan = 'pro', storage_limit_bytes = $2 WHERE email = $1",
        [email, proStorage]
      );
      // Only (re)set the password when explicitly provided, or when the account
      // has none yet (e.g. a Google-only account being promoted).
      const needsPassword = explicitPassword || !existing.rows[0].password;
      if (needsPassword) {
        const hashed = await bcrypt.hash(password, 12);
        await pool.query('UPDATE users SET password = $2 WHERE email = $1', [email, hashed]);
      }
      console.log(`✓ Promoted existing account to super_admin: ${email}`);
      if (needsPassword && !explicitPassword) {
        console.log(`  Temporary password (change after first login): ${password}`);
      }
    } else {
      const hashed = await bcrypt.hash(password, 12);
      await pool.query(
        `INSERT INTO users (name, email, password, role, plan, storage_limit_bytes)
         VALUES ($1, $2, $3, 'super_admin', 'pro', $4)`,
        ['Super Admin', email, hashed, proStorage]
      );
      console.log(`✓ Created super_admin account: ${email}`);
      if (!explicitPassword) {
        console.log(`  Temporary password (change after first login): ${password}`);
      }
    }
  } catch (err) {
    console.error('seed-admin failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
