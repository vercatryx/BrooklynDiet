#!/usr/bin/env node
/**
 * Seed Brooklyn Diet Supabase project (direct Supabase only, no Prisma):
 * - Default vendor (Brooklyn Diet, is_default = true)
 * - app_settings row (id = 1)
 * - Default client status "Active"
 * - Clients from CSV (Andrea Vogel, Rivky Brach, Moses Gluck, Carlos Chablay Cajisaca)
 *
 * Run from brooklyn clone root: node scripts/seed-brooklyn-defaults.js
 * Requires .env with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * If you see "Could not find the table 'public.vendors'", create the schema once:
 *   npx prisma migrate deploy
 * (then run this script again.)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  console.error('No .env in brooklyn clone. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const env = {};
fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
  const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function main() {
  console.log('Seeding Brooklyn Diet defaults...\n');

  // 1) Default vendor
  const { data: existingVendors } = await supabase.from('vendors').select('id, name, is_default').limit(5);
  let defaultVendorId;
  if (existingVendors && existingVendors.length > 0) {
    const defaultV = existingVendors.find((v) => v.is_default) || existingVendors[0];
    defaultVendorId = defaultV.id;
    console.log('Vendor already exists:', defaultV.name, '(id:', defaultVendorId, ')');
  } else {
    defaultVendorId = uuid();
    const { error: ve } = await supabase.from('vendors').insert({
      id: defaultVendorId,
      name: 'Brooklyn Diet',
      is_active: true,
      is_default: true,
      delivery_frequency: 'Once',
    });
    if (ve) {
      console.error('Failed to insert vendor:', ve.message);
      if (ve.message && ve.message.includes('schema cache')) {
        console.error('\n→ Run first: npx prisma migrate deploy');
      }
      process.exit(1);
    }
    console.log('Created default vendor: Brooklyn Diet (id:', defaultVendorId, ')');
  }

  // 2) app_settings (id = 1)
  const { data: existingSettings } = await supabase.from('app_settings').select('id').eq('id', '1').single();
  if (existingSettings) {
    console.log('app_settings already exists (id=1)');
  } else {
    const { error: ae } = await supabase.from('app_settings').insert({
      id: '1',
      weekly_cutoff_day: 'Friday',
      weekly_cutoff_time: '17:00',
      enable_passwordless_login: false,
    });
    if (ae) {
      console.error('Failed to insert app_settings:', ae.message);
    } else {
      console.log('Created app_settings (id=1)');
    }
  }

  // 3) Default client status "Active"
  const { data: statuses } = await supabase.from('client_statuses').select('id, name').limit(5);
  let activeStatusId;
  if (statuses && statuses.length > 0) {
    const active = statuses.find((s) => s.name === 'Active') || statuses[0];
    activeStatusId = active.id;
    console.log('Client status already exists:', active.name, '(id:', activeStatusId, ')');
  } else {
    activeStatusId = uuid();
    const { error: se } = await supabase.from('client_statuses').insert({
      id: activeStatusId,
      name: 'Active',
      is_system_default: true,
      deliveries_allowed: true,
      requires_units_on_change: false,
    });
    if (se) {
      console.error('Failed to insert client_status:', se.message);
      process.exit(1);
    }
    console.log('Created client status: Active (id:', activeStatusId, ')');
  }

  // 4) Clients from CSV (only insert if not already present by full_name)
  const csvClients = [
    {
      full_name: 'Andrea Vogel',
      dob: '1992-02-21',
      address: '1044 E 12th Street, Apt. 3, Brooklyn NY 11230',
      phone_number: '917-754-0561',
      notes: 'Diet: Pregnancy. Allergy: None. Pregnant mother, Provide whole grains, high fiber food, fresh fruits/veg, suffers from constipation. MTM are appropriate.',
    },
    {
      full_name: 'Rivky Brach',
      dob: '1998-06-24',
      address: '744 BEDFORD AVE, BROOKLYN, NY 11205',
      phone_number: '(347) 609-3913',
      notes: 'Diet: Postpartum. Allergy: None. Postpartum mother who is lactating, has a personal weight loss goal, counseling provided to focus on receiving enough nutrition during lactation for mother & baby as member bmi is WNL.',
    },
    {
      full_name: 'Moses Gluck',
      dob: '2009-07-21',
      address: '157 WALLABOUT ST 4H, BROOKLYN, NY 11206-5473',
      phone_number: '347-314-1813',
      notes: 'Diet: No added sugar/cardiac diet. Allergy: None. Member is 16 year old male with very high cholesterol levels, education provided to member\'s mother who is trying help her son follow a low carb diet wut lower sugar consumption.',
    },
    {
      full_name: 'Carlos Chablay Cajisaca',
      dob: '2023-12-20',
      address: '104-22 45th avenue flushing NY 11368',
      phone_number: '908-422-9339',
      notes: 'Diet: Postpartum. Allergy: None. 2 year old child with Autism who\'s mother is also nursing. No specific food requests or concerns noted. Appropriate to receive MTM.',
    },
  ];

  const { data: existingClients } = await supabase.from('clients').select('id, full_name');
  const existingNames = new Set((existingClients || []).map((c) => c.full_name.trim().toLowerCase()));
  const toInsert = csvClients.filter((c) => !existingNames.has(c.full_name.trim().toLowerCase()));
  if (toInsert.length === 0) {
    console.log('All CSV clients already exist, skipping.');
  } else {
    const rows = toInsert.map((c) => ({
      id: uuid(),
      full_name: c.full_name,
      service_type: 'food',
      status_id: activeStatusId,
      bill: true,
      delivery: true,
      paused: false,
      dob: c.dob,
      address: c.address,
      phone_number: c.phone_number,
      notes: c.notes || null,
    }));
    const { error: ce } = await supabase.from('clients').insert(rows);
    if (ce) {
      console.error('Failed to insert clients:', ce.message);
    } else {
      console.log('Created', rows.length, 'clients:', rows.map((r) => r.full_name).join(', '));
    }
  }

  console.log('\nDone. Default vendor and CSV clients are set.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
