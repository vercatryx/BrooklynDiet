/**
 * Verifies how many clients match the Needs Attention criteria:
 * 1. Expiration date on or before one month from today
 * 2. Authorized amount < 2000 or null/undefined
 * Run: npx tsx scripts/check-needs-attention-count.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function needsAttention(expirationDate: string | null, authorizedAmount: number | string | null | undefined): { match: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneMonthFromToday = new Date(today);
    oneMonthFromToday.setMonth(oneMonthFromToday.getMonth() + 1);

    let expiresWithinMonth = false;
    if (expirationDate) {
        const expDate = new Date(String(expirationDate).trim());
        if (!isNaN(expDate.getTime())) {
            expDate.setHours(0, 0, 0, 0);
            const cutoff = new Date(oneMonthFromToday);
            cutoff.setHours(23, 59, 59, 999);
            expiresWithinMonth = expDate <= cutoff;
            if (expiresWithinMonth) reasons.push('Expires within one month');
        }
    }

    const amount = authorizedAmount != null && authorizedAmount !== '' ? Number(authorizedAmount) : NaN;
    const authLowOrMissing = (amount !== amount) || amount < 2000;
    if (amount !== amount) reasons.push('No authorized amount');
    else if (amount < 2000) reasons.push(`Auth amount $${amount} < $2,000`);

    const match = expiresWithinMonth || authLowOrMissing;
    return { match, reasons };
}

async function main() {
    console.log('Fetching clients and statuses...\n');

    const { data: clients, error: clientsErr } = await supabase
        .from('clients')
        .select('id, full_name, status_id, expiration_date, authorized_amount, parent_client_id')
        .is('parent_client_id', null); // primary clients only, like the app

    if (clientsErr) {
        console.error('Error fetching clients:', clientsErr);
        process.exit(1);
    }

    const list = clients ?? [];
    const total = list.length;
    const needsAttentionList: { id: string; full_name: string; reasons: string[] }[] = [];

    const today = new Date().toISOString().slice(0, 10);
    const oneMonth = new Date();
    oneMonth.setMonth(oneMonth.getMonth() + 1);
    const oneMonthStr = oneMonth.toISOString().slice(0, 10);

    console.log(`Today: ${today}`);
    console.log(`One month from today: ${oneMonthStr}`);
    console.log(`Total primary clients: ${total}\n`);

    for (const c of list) {
        const { match, reasons } = needsAttention(c.expiration_date, c.authorized_amount);
        if (match) {
            needsAttentionList.push({
                id: c.id,
                full_name: c.full_name ?? '',
                reasons,
            });
        }
    }

    console.log(`Needs Attention count: ${needsAttentionList.length}`);
    console.log('\nFirst 15 that need attention:');
    needsAttentionList.slice(0, 15).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.full_name} (${c.id}) — ${c.reasons.join(', ')}`);
    });
    if (needsAttentionList.length === 0) {
        console.log('  (none)');
        console.log('\nSample of clients (first 5) for debugging:');
        list.slice(0, 5).forEach((c, i) => {
            const { match, reasons } = needsAttention(c.expiration_date, c.authorized_amount);
            console.log(`  ${i + 1}. ${c.full_name} | expiration_date=${c.expiration_date} | authorized_amount=${c.authorized_amount} | match=${match} ${reasons.length ? `| ${reasons.join(', ')}` : ''}`);
        });
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
