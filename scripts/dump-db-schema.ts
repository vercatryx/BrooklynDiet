/**
 * Introspect the live Postgres database and dump the current schema.
 * Does not use Prisma — connects directly via pg. Use this to verify
 * the real DB schema (e.g. compare with prisma/schema.prisma or as source of truth).
 *
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' scripts/dump-db-schema.ts
 * Or:    npm run dump-db-schema
 *
 * Writes to docs/db-schema-dump.txt (and prints to stdout). Requires DATABASE_URL in .env.local.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    }
  });
} else {
  console.error('No .env.local found. Create it with DATABASE_URL.');
  process.exit(1);
}

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}

// Use direct connection (5432) for introspection; Supabase pooler is 6543
if (databaseUrl.includes(':6543')) {
  databaseUrl = databaseUrl.replace(':6543', ':5432');
}
// Prefer our SSL options over URL so Supabase cert works in Node
const urlObj = new URL(databaseUrl);
urlObj.searchParams.delete('sslmode');
urlObj.searchParams.delete('ssl');
databaseUrl = urlObj.toString().replace(/^postgres:/, 'postgresql:');

interface ColumnRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

interface PkRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  constraint_name: string;
}

async function main() {
  const lines: string[] = [];
  const log = (msg: string) => {
    lines.push(msg);
    console.log(msg);
  };

  // Supabase (and many cloud Postgres) use certs that Node may reject; allow for introspection
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await runIntrospection(client, log);
  await client.end();
  writeOutput(lines);
}

async function runIntrospection(client: Client, log: (msg: string) => void) {
  log('# Database schema dump (live Postgres – public schema only)');
  log(`# Generated: ${new Date().toISOString()}`);
  log('');

  // Tables in public schema
  const tablesRes = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
  const tableNames = tablesRes.rows.map((r) => r.table_name);
  log(`Tables (${tableNames.length}): ${tableNames.join(', ')}`);
  log('');

  // Columns
  const columnsRes = await client.query<ColumnRow>(`
      SELECT table_schema, table_name, column_name, data_type, udt_name,
             is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

  // Primary keys
  const pkRes = await client.query<PkRow>(`
      SELECT tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `);
  const pkMap = new Map<string, Set<string>>();
  for (const r of pkRes.rows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (!pkMap.has(key)) pkMap.set(key, new Set());
    pkMap.get(key)!.add(r.column_name);
  }

  let currentTable = '';
  for (const c of columnsRes.rows) {
    if (c.table_name !== currentTable) {
      currentTable = c.table_name;
      log(`## ${currentTable}`);
    }
    const pkSet = pkMap.get(`${c.table_schema}.${c.table_name}`);
    const pk = pkSet?.has(c.column_name) ? ' PRIMARY KEY' : '';
    const nullStr = c.is_nullable === 'YES' ? ' NULL' : ' NOT NULL';
    let typeStr = c.udt_name;
    if (c.character_maximum_length != null) typeStr += `(${c.character_maximum_length})`;
    else if (c.numeric_precision != null)
      typeStr += `(${c.numeric_precision}${c.numeric_scale != null ? ',' + c.numeric_scale : ''})`;
    const defaultStr = c.column_default ? ` DEFAULT ${c.column_default}` : '';
    log(`  ${c.column_name}: ${typeStr}${nullStr}${defaultStr}${pk}`);
  }

  log('');
  log('# Indexes (non-PK)');
  const idxRes = await client.query<{ tablename: string; indexname: string; indexdef: string }>(`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
  for (const r of idxRes.rows) {
    const isPk = r.indexname.includes('_pkey');
    if (isPk) continue;
    log(`${r.tablename}: ${r.indexname}`);
    log(`  ${r.indexdef}`);
  }
}

function writeOutput(lines: string[]) {
  const outDir = path.join(process.cwd(), 'docs');
  const outPath = path.join(outDir, 'db-schema-dump.txt');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log('\nWrote: ' + outPath);
}

main().catch((e) => {
  console.error('Introspection failed:', (e as Error).message);
  if (process.env.DATABASE_URL?.includes('6543')) {
    console.error('Tip: Use direct connection (port 5432) from Supabase Dashboard → Settings → Database.');
  }
  process.exit(1);
});
