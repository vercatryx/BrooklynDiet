#!/usr/bin/env node
/**
 * Diagnose why Routes tab (and Unrouted) may be empty.
 * Reads .env or .env.local from brooklyn clone root.
 * Run: node scripts/diagnose-routes-db.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');

function loadEnv(fileName) {
  const p = path.join(root, fileName);
  if (!fs.existsSync(p)) return {};
  const env = {};
  fs.readFileSync(p, 'utf-8').split('\n').forEach((line) => {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  });
  return env;
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env / .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function todayYYYYMMDD() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function main() {
  const today = todayYYYYMMDD();
  console.log('=== Routes DB diagnosis ===');
  console.log('Date used for orders/stops:', today);
  console.log('');

  // 1) Clients (use * to avoid schema differences e.g. assigned_driver_id)
  const { data: clients, error: eClients } = await supabase
    .from('clients')
    .select('id, full_name, paused, delivery, lat, lng, parent_client_id');
  if (eClients) {
    const { data: clientsFallback } = await supabase.from('clients').select('*');
    const c = clientsFallback || [];
    const primaries = c.filter((x) => !x.parent_client_id);
    console.log('CLIENTS: total', c.length, '| primaries', primaries.length, '(schema note: some columns may differ)');
    if (primaries.length > 0) {
      console.log('         sample:', primaries.slice(0, 3).map((x) => x.full_name || x.id).join(', '));
    }
  } else {
    const primaries = (clients || []).filter((c) => !c.parent_client_id);
    const withGeo = (clients || []).filter((c) => c.lat != null && c.lng != null);
    const deliveryOn = (clients || []).filter((c) => c.paused !== true && c.delivery !== false);
    console.log('CLIENTS: total', (clients || []).length, '| primaries', primaries.length);
    console.log('         delivery-eligible (not paused, delivery on):', deliveryOn.length);
    console.log('         with lat/lng (for map):', withGeo.length);
    if (primaries.length > 0) {
      console.log('         sample:', primaries.slice(0, 3).map((c) => c.full_name || c.id).join(', '));
    }
  }
  console.log('');

  // 2) Stops (this is what Routes API uses for map + unrouted)
  const { data: stopsAll, error: eStops } = await supabase
    .from('stops')
    .select('id, client_id, delivery_date, day, assigned_driver_id');
  if (eStops) {
    console.log('STOPS: Error', eStops.message);
  } else {
    const stops = stopsAll || [];
    const byDate = {};
    stops.forEach((s) => {
      const d = s.delivery_date ? String(s.delivery_date).slice(0, 10) : '(null)';
      byDate[d] = (byDate[d] || 0) + 1;
    });
    console.log('STOPS: total', stops.length);
    if (stops.length === 0) {
      console.log('         *** No stops in DB → Routes map and Unrouted will be empty ***');
    } else {
      console.log('         by delivery_date:', JSON.stringify(byDate));
      const forToday = stops.filter((s) => s.delivery_date && String(s.delivery_date).slice(0, 10) === today);
      console.log('         for today (' + today + '):', forToday.length);
    }
  }
  console.log('');

  // 3) Drivers
  const { data: drivers, error: eDrivers } = await supabase
    .from('drivers')
    .select('id, name');
  if (eDrivers) {
    console.log('DRIVERS: Error', eDrivers.message);
  } else {
    console.log('DRIVERS: total', (drivers || []).length);
    if ((drivers || []).length > 0) {
      console.log('         names:', (drivers || []).map((d) => d.name).join(', '));
    } else {
      console.log('         *** No drivers → need "Generate New Route" or Add Driver on Routes page ***');
    }
  }
  console.log('');

  // 4) Routes table (legacy)
  const { data: routesRows, error: eRoutes } = await supabase
    .from('routes')
    .select('id, name');
  if (eRoutes) {
    console.log('ROUTES (table): Error', eRoutes.message);
  } else {
    console.log('ROUTES (table): total', (routesRows || []).length);
  }
  console.log('');

  // 5) Orders for today (stops are often created from orders)
  const { data: ordersToday, error: eOrd } = await supabase
    .from('orders')
    .select('id, client_id, scheduled_delivery_date')
    .eq('scheduled_delivery_date', today);
  if (eOrd) {
    console.log('ORDERS (today): Error', eOrd.message);
  } else {
    console.log('ORDERS (today ' + today + '):', (ordersToday || []).length);
  }

  const { data: upcomingToday, error: eUp } = await supabase
    .from('upcoming_orders')
    .select('id, client_id, scheduled_delivery_date')
    .eq('scheduled_delivery_date', today);
  if (eUp) {
    console.log('UPCOMING_ORDERS (today): Error', eUp.message);
  } else {
    console.log('UPCOMING_ORDERS (today):', (upcomingToday || []).length);
  }
  console.log('');

  // Summary
  console.log('--- Summary ---');
  const nStops = (stopsAll || []).length;

  if (nStops === 0) {
    console.log('ISSUE: There are 0 rows in the "stops" table.');
    console.log('The Routes page map and "Unrouted" list are built ONLY from the stops table.');
    console.log('The seed script does not create stops. Stops are normally created when:');
    console.log('  - Orders exist (orders or upcoming_orders) and the route API runs without ?light=1, or');
    console.log('  - You run a cleanup/sync that creates stops from orders.');
    console.log('So: clients exist and show on Client Dashboard, but Routes/Unrouted stay empty until');
    console.log('stops exist for the selected delivery date.');
  } else {
    console.log('Stops exist. If Routes still shows empty, check the selected delivery date in the UI');
    console.log('matches a date that has stops (see "by delivery_date" above).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
