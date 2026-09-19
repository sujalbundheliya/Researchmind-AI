require('dotenv').config();
const net = require('net');
const dns = require('dns');
const { Pool } = require('pg');

// Disable Happy Eyeballs (parallel IPv4/IPv6 connect racing): in containers
// without an IPv6 route, racing against unreachable IPv6 addresses causes the
// otherwise-fine IPv4 attempts to time out too. Force plain IPv4-first lookups.
net.setDefaultAutoSelectFamily(false);
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('Unexpected DB client error', err);
});

// Wake up Neon on startup so the first real request never hits a cold DB
pool.query('SELECT 1').catch((err) => {
  console.error('DB warmup failed:', err.message);
});

// Neon suspends after ~5 min of inactivity — ping every 4 min to prevent the
// ~1.5 s cold-wake penalty on the next real query
setInterval(() => {
  pool.query('SELECT 1').catch((err) => {
    console.error('DB keepalive failed:', err.message);
  });
}, 4 * 60 * 1000);

module.exports = {
  query: (text, params) => pool.query(text, params),
};
