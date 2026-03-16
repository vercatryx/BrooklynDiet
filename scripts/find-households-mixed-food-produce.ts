/**
 * Find households where at least one member is Food and at least one is Produce.
 * Useful to test the "meals only for Food clients" filter in the client portal.
 *
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' scripts/find-households-mixed-food-produce.ts
 * Or: npm run find-households-mixed-food-produce (if added to package.json)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY)");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: clients, error } = await supabase
        .from("clients")
        .select("id, full_name, parent_client_id, service_type")
        .order("full_name");

    if (error) {
        console.error("Error fetching clients:", error.message);
        process.exit(1);
    }

    const list = (clients || []) as { id: string; full_name: string; parent_client_id: string | null; service_type: string }[];

    // Build household = parent id -> members (parent + dependants)
    const byParent = new Map<string, typeof list>();
    for (const c of list) {
        const parentId = c.parent_client_id || c.id;
        if (!byParent.has(parentId)) byParent.set(parentId, []);
        byParent.get(parentId)!.push(c);
    }

    const mixed: { parentId: string; members: typeof list }[] = [];
    for (const [parentId, members] of byParent) {
        const types = new Set(members.map((m) => m.service_type));
        if (types.has("Food") && types.has("Produce")) {
            mixed.push({ parentId, members });
        }
    }

    if (mixed.length === 0) {
        console.log("No households found with both Food and Produce members.");
        return;
    }

    console.log(`Found ${mixed.length} household(s) with both Food and Produce:\n`);
    for (const { parentId, members } of mixed) {
        const parent = members.find((m) => m.id === parentId) || members[0];
        console.log(`Household: ${parent.full_name} (parent id: ${parentId})`);
        for (const m of members) {
            console.log(`  - ${m.service_type.padEnd(8)} ${m.full_name}  id: ${m.id}`);
        }
        console.log(`  -> Client portal (Food) URL: /client-portal/${members.find((m) => m.service_type === "Food")!.id}`);
        console.log("");
    }
}

main();
