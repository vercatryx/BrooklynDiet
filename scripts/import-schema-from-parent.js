#!/usr/bin/env node
/**
 * Import schema from parent project into Brooklyn Supabase (direct Postgres, no Prisma).
 * Runs migration SQL files in prisma/migrations in order using DATABASE_URL from .env.
 * Run from brooklyn clone root: node scripts/import-schema-from-parent.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  console.error('No .env. Set DATABASE_URL for Brooklyn Supabase.');
  process.exit(1);
}
const env = {};
fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
  const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});
let databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL missing in .env');
  process.exit(1);
}
// Prefer SSL option over URL so Supabase cert works
const urlForSsl = databaseUrl.replace(/\?sslmode=[^&]+&?/g, '&').replace(/&$/, '');
if (urlForSsl.includes('?')) databaseUrl = urlForSsl;
else databaseUrl = urlForSsl + '?';

const migrationsDir = path.join(root, 'prisma', 'migrations');
const dirs = fs.readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d+_/.test(d.name))
  .map((d) => d.name)
  .sort((a, b) => {
    const aInit = a.includes('_init');
    const bInit = b.includes('_init');
    if (aInit && !bInit) return -1;
    if (!aInit && bInit) return 1;
    return a.localeCompare(b);
  });

function buildPoolerUrls(directUrl) {
  const m = directUrl.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@db\.([a-z0-9]+)\.supabase\.co/);
  if (!m) return [];
  const [, , pass, ref] = m;
  const user = `postgres.${ref}`;
  const passEnc = pass.includes('@') || pass.includes(':') ? encodeURIComponent(pass) : pass;
  const regions = ['us-east-1', 'ap-south-1', 'us-west-1', 'eu-west-1', 'ap-southeast-1'];
  const urls = [];
  for (const r of regions) {
    urls.push(`postgresql://${user}:${passEnc}@aws-0-${r}.pooler.supabase.com:5432/postgres`);
    urls.push(`postgresql://${user}:${passEnc}@aws-0-${r}.pooler.supabase.com:6543/postgres`);
    urls.push(`postgresql://${user}:${passEnc}@aws-1-${r}.pooler.supabase.com:5432/postgres`);
  }
  return urls;
}

async function connect() {
  const rawUrl = env.DATABASE_URL || databaseUrl;
  const urlsToTry = [
    rawUrl,
    ...buildPoolerUrls(rawUrl),
  ];
  let lastErr;
  for (const connUrl of urlsToTry) {
    const client = new Client({ connectionString: connUrl, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      console.log('Connected.');
      return client;
    } catch (e) {
      lastErr = e;
      await client.end().catch(() => {});
    }
  }
  throw lastErr;
}

async function main() {
  const client = await connect();
  console.log('Connected to Brooklyn DB. Applying', dirs.length, 'migrations...\n');
  for (const dir of dirs) {
    const sqlPath = path.join(migrationsDir, dir, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    const name = dir.replace(/^\d+_/, '');
    try {
      await client.query(sql);
      console.log('OK:', name);
    } catch (err) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate key'))) {
        console.log('Skip (exists):', name);
      } else {
        console.error('FAIL:', name, err.message);
        await client.end();
        process.exit(1);
      }
    }
  }
  await client.end();
  console.log('\nSchema import done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
