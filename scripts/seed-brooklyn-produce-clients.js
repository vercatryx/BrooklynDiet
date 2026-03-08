#!/usr/bin/env node
/**
 * Add produce clients to Brooklyn Diet Supabase project.
 * Parses address into street, city, state, zip. Uses same .env as seed-brooklyn-defaults.js.
 *
 * Run from brooklyn clone root: node scripts/seed-brooklyn-produce-clients.js
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

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Parse "STREET, CITY, ST ZIP" or "STREET, CITY, ST ZIP-EXT" into { address, city, state, zip } */
function parseAddress(raw) {
  const s = (raw || '').trim();
  if (!s) return { address: '', city: null, state: null, zip: null };
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) {
    return { address: s, city: null, state: null, zip: null };
  }
  const street = parts.slice(0, -2).join(', ');
  const city = parts[parts.length - 2] || null;
  const stateZip = parts[parts.length - 1] || '';
  const match = stateZip.match(/^([A-Za-z]{2})\s+(\d{5})(?:-\d+)?$/);
  const state = match ? match[1].toUpperCase() : null;
  const zip = match ? match[2] : null;
  return { address: street, city, state, zip };
}

/** Normalize M/D/YYYY or MM/DD/YYYY to YYYY-MM-DD */
function normalizeDob(input) {
  const s = (input || '').trim();
  if (!s) return null;
  const parts = s.split('/').map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [m, d, y] = parts;
  const month = m.padStart(2, '0');
  const day = d.padStart(2, '0');
  const year = y.length === 2 ? (parseInt(y, 10) >= 50 ? '19' + y : '20' + y) : y;
  return `${year}-${month}-${day}`;
}

/** Normalize phone: digits only, optional leading 1 */
function normalizePhone(input) {
  const s = (input || '').replace(/\D/g, '').replace(/^1/, '');
  return s || null;
}

// Produce clients from CSV (address parsed into address, city, state, zip)
const produceClients = [
  { full_name: 'Moshe Eichler', dob: '3/30/2010', familyMembers: 2, address: '1693 49TH STREET 3FL, BROOKLYN, NY 11204', phone: '(718) 853-4304 / 732-397-6026', notes: 'Spoke with member\'s mother, reports no dietary restrictions. Diet: 6026, Regular Clinically Appropriate/balanced diet.' },
  { full_name: 'Estie Eichler', dob: '11/10/2013', familyMembers: 1, address: '1693 49TH STREET 3FL, BROOKLYN, NY 11204', phone: '(718) 853-4304 / 732-397-6026', notes: 'Spoke with member\'s mother, reports no dietary restrictions. Regular Clinically Appropriate Balanced diet.' },
  { full_name: 'Ivanna Ramirez Cruz', dob: '5/24/2018', familyMembers: 1, address: '503 KINGS HIGHWAY 2F, BROOKLYN, NY 11223-0000', phone: '917-500-3563', notes: '' },
  { full_name: 'Elias Martinez Rojas', dob: '11/1/2023', familyMembers: 1, address: '1319 AVE J, BROOKLYN, NY 11230', phone: '347-499-5609', notes: '2 year old child who is being evaluated for autism, education provided. Regular Clinically Appropriate Balanced diet.' },
  { full_name: 'Rushelle Exeter', dob: '10/2/1986', familyMembers: 4, address: '1415 NEW YORK AVE 4F, BROOKLYN, NY 11210', phone: '931-998-1065', notes: '' },
  { full_name: 'Selli Kredi', dob: '6/1/1995', familyMembers: 4, address: '1500 OCEAN PKWY APT 2H, BROOKLYN, NY 11230', phone: '347-210-6134', notes: 'Postpartum diet. Spoke with member who reports no dietary restrictions, except that she only eats kosher food.' },
  { full_name: 'Cristian Velazquez Munguia', dob: '5/9/2012', familyMembers: 1, address: '388 AVENUE 1, BROOKLYN, NY 11223-5350', phone: '347-651-4186', notes: 'Regular Clinically Appropriate Balanced diet. Spoke with member\'s mother reports no dietary restrictions.' },
  { full_name: 'Trina Dunston', dob: '3/31/1973', familyMembers: 1, address: '2202 LINDEN BOULEVARD 13B, BROOKLYN, NY 11207-0000', phone: '646-739-2082', notes: 'HTN (Dash) low sodium diet. Member reports no specific dietary restrictions or food allergies. Will accept low sodium diet.' },
  { full_name: 'William Velasquez Vicente', dob: '4/2/2011', familyMembers: 1, address: '2034 77 STREET, BROOKLYN, NY 11214', phone: '347-569-7004', notes: 'Obesity/Weight Management Diet. Spoke with father of member reports no dietary restrictions, obesity management goal.' },
  { full_name: 'Alba Gomez Carrasco', dob: '11/29/2016', familyMembers: 2, address: '1616 E 2ND ST APT 2R, BROOKLYN, NY 11230', phone: '347-792-2175', notes: 'Regular Clinically Appropriate Balanced diet. Spoke with member\'s mother reports no dietary restrictions.' },
  { full_name: 'Jean Whitelock', dob: '11/18/1946', familyMembers: null, address: '567 E 26TH STREET 3D, BROOKLYN, NY 11210-0000', phone: '718-614-5539', notes: 'Renal diet. Allergic to nuts & watermelon, no beef per preferences. Spoke with member who reports food allergy to watermelon and nuts, dislikes beef, recommend renal diet to manage disease.' },
  { full_name: 'Myrian Chicaiza Piedra', dob: '3/22/1988', familyMembers: 1, address: '2022 79TH ST, BROOKLYN, NY 11214', phone: '(908) 966-9309', notes: 'Postpartum. Lactating mother, reports no dietary restrictions, education provided.' },
  { full_name: 'Emuna Babekov', dob: '9/19/2021', familyMembers: 5, address: '7318 174TH ST, FRESH MEADOWS, NY 11366', phone: '917-435-7295', notes: 'Regular clinically appropriate balanced diet. Spoke with mother of member who reports no dietary restrictions.' },
];

async function main() {
  console.log('Adding Brooklyn Diet produce clients...\n');

  const { data: statuses } = await supabase.from('client_statuses').select('id, name').limit(5);
  const activeStatus = (statuses && statuses.length > 0)
    ? (statuses.find((s) => s.name === 'Active') || statuses[0])
    : null;
  if (!activeStatus) {
    console.error('No client status found. Run seed-brooklyn-defaults.js first to create Active status.');
    process.exit(1);
  }
  const activeStatusId = activeStatus.id;

  const { data: existingClients } = await supabase.from('clients').select('id, full_name');
  const existingNames = new Set((existingClients || []).map((c) => (c.full_name || '').trim().toLowerCase()));

  const toInsert = [];
  for (const row of produceClients) {
    const name = (row.full_name || '').trim();
    if (!name || existingNames.has(name.toLowerCase())) continue;

    const { address, city, state, zip } = parseAddress(row.address);
    const dob = normalizeDob(row.dob);
    const phone = normalizePhone(row.phone) ? row.phone.trim() : null;

    toInsert.push({
      id: uuid(),
      full_name: name,
      service_type: 'Produce',
      status_id: activeStatusId,
      bill: true,
      delivery: true,
      paused: false,
      dob: dob || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      phone_number: phone,
      notes: (row.notes || '').trim() || null,
    });
  }

  if (toInsert.length === 0) {
    console.log('All produce clients already exist, nothing to add.');
    return;
  }

  const { error } = await supabase.from('clients').insert(toInsert);
  if (error) {
    console.error('Failed to insert produce clients:', error.message);
    process.exit(1);
  }

  console.log('Added', toInsert.length, 'produce clients:', toInsert.map((r) => r.full_name).join(', '));
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
