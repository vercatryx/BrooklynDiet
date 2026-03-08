#!/usr/bin/env node
/**
 * Fix clients that were saved with service_type 'produce' (lowercase) so they show as Produce.
 * The app expects service_type = 'Produce' (capital P); lowercase shows as Food.
 *
 * Run from brooklyn clone root: node scripts/fix-produce-service-type.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
function loadEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return {};
  const env = {};
  fs.readFileSync(p, 'utf-8').split('\n').forEach((line) => {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return env;
}
const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env or .env.local');
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log('Fixing produce clients (service_type -> Produce)...\n');

  const { data: clients, error: fetchError } = await supabase
    .from('clients')
    .select('id, full_name, service_type');

  if (fetchError) {
    console.error('Failed to fetch clients:', fetchError.message);
    process.exit(1);
  }

  const needFix = (clients || []).filter((c) => {
    const st = (c.service_type || '').trim();
    return st.toLowerCase() === 'produce' && st !== 'Produce';
  });

  if (needFix.length === 0) {
    console.log('No clients need fixing (all produce clients already have service_type = "Produce").');
    return;
  }

  console.log('Updating', needFix.length, 'client(s) to service_type = "Produce":');
  needFix.forEach((c) => console.log('  -', c.full_name || c.id));

  for (const c of needFix) {
    const { error: updateError } = await supabase
      .from('clients')
      .update({ service_type: 'Produce' })
      .eq('id', c.id);

    if (updateError) {
      console.error('Failed to update', c.id, updateError.message);
      process.exit(1);
    }
  }

  console.log('\nDone. All produce clients now have service_type = "Produce".');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
